"""Utilities for stats."""

import asyncio
import os
import shutil
import time
from typing import Any, Optional

import psutil
import requests
from requests.exceptions import RequestException

from vigision.config import VigisionConfig
from vigision.const import CACHE_DIR, CLIPS_DIR, RECORD_DIR
from vigision.object_detection import ObjectDetectProcess
from vigision.types import CameraMetricsTypes, StatsTrackingTypes
from vigision.util.services import (
    get_amd_gpu_stats,
    get_bandwidth_stats,
    get_cpu_stats,
    get_intel_gpu_stats,
    get_jetson_stats,
    get_nvidia_gpu_stats,
    is_vaapi_amd_driver,
)
from vigision.version import VERSION


def get_latest_version(config: VigisionConfig) -> str:
    if not config.telemetry.version_check:
        return "disabled"

    return "unknown"

    response = request.json()

    if request.ok and response and "tag_name" in response:
        return str(response.get("tag_name").replace("v", ""))
    else:
        return "unknown"


def stats_init(
    config: VigisionConfig,
    camera_metrics: dict[str, CameraMetricsTypes],
    detectors: dict[str, ObjectDetectProcess],
    processes: dict[str, int],
) -> StatsTrackingTypes:
    stats_tracking: StatsTrackingTypes = {
        "camera_metrics": camera_metrics,
        "detectors": detectors,
        "started": int(time.time()),
        "latest_vigision_version": get_latest_version(config),
        "last_updated": int(time.time()),
        "processes": processes,
    }
    return stats_tracking


def get_fs_type(path: str) -> str:
    bestMatch = ""
    fsType = ""
    for part in psutil.disk_partitions(all=True):
        if path.startswith(part.mountpoint) and len(bestMatch) < len(part.mountpoint):
            fsType = part.fstype
            bestMatch = part.mountpoint
    return fsType


def read_temperature(path: str) -> Optional[float]:
    if os.path.isfile(path):
        with open(path) as f:
            line = f.readline().strip()
            return int(line) / 1000
    return None


def get_temperatures() -> dict[str, float]:
    temps = {}

    # Get temperatures for all attached Corals
    base = "/sys/class/apex/"
    if os.path.isdir(base):
        for apex in os.listdir(base):
            temp = read_temperature(os.path.join(base, apex, "temp"))
            if temp is not None:
                temps[apex] = temp

    return temps


def get_processing_stats(
    config: VigisionConfig, stats: dict[str, str], hwaccel_errors: list[str]
) -> None:
    """Get stats for cpu / gpu."""

    async def run_tasks() -> None:
        stats_tasks = [
            asyncio.create_task(set_gpu_stats(config, stats, hwaccel_errors)),
            asyncio.create_task(set_cpu_stats(stats)),
        ]

        if config.telemetry.stats.network_bandwidth:
            stats_tasks.append(asyncio.create_task(set_bandwidth_stats(config, stats)))

        await asyncio.wait(stats_tasks)

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(run_tasks())
    loop.close()


async def set_cpu_stats(all_stats: dict[str, Any]) -> None:
    """Set cpu usage from top."""
    cpu_stats = get_cpu_stats()

    if cpu_stats:
        all_stats["cpu_usages"] = cpu_stats


async def set_bandwidth_stats(config: VigisionConfig, all_stats: dict[str, Any]) -> None:
    """Set bandwidth from nethogs."""
    bandwidth_stats = get_bandwidth_stats(config)

    if bandwidth_stats:
        all_stats["bandwidth_usages"] = bandwidth_stats


async def set_gpu_stats(
    config: VigisionConfig, all_stats: dict[str, Any], hwaccel_errors: list[str]
) -> None:
    """Parse GPUs from hwaccel args and use for stats."""
    hwaccel_args = []

    for camera in config.cameras.values():
        args = camera.ffmpeg.hwaccel_args

        if isinstance(args, list):
            args = " ".join(args)

        if args and args not in hwaccel_args:
            hwaccel_args.append(args)

        for stream_input in camera.ffmpeg.inputs:
            args = stream_input.hwaccel_args

            if isinstance(args, list):
                args = " ".join(args)

            if args and args not in hwaccel_args:
                hwaccel_args.append(args)

    stats: dict[str, dict] = {}
    for args in hwaccel_args:
        # if args in hwaccel_errors:
        #     # known erroring args should automatically return as error
        #     stats["error-gpu"] = {"gpu": "", "mem": ""}
        if "cuvid" in args or "nvidia" in args:
            # nvidia GPU
            nvidia_usage = get_nvidia_gpu_stats()

            if nvidia_usage:
                for i in range(len(nvidia_usage)):
                    stats[nvidia_usage[i]["name"]] = {
                        "gpu": str(round(float(nvidia_usage[i]["gpu"]), 2)) + "%",
                        "mem": str(round(float(nvidia_usage[i]["mem"]), 2)) + "%",
                        "enc": str(round(float(nvidia_usage[i]["enc"]), 2)) + "%",
                        "dec": str(round(float(nvidia_usage[i]["dec"]), 2)) + "%",
                    }

            else:
                stats["nvidia-gpu"] = {"gpu": "", "mem": ""}
                hwaccel_errors.append(args)
        elif "nvmpi" in args or "jetson" in args:
            # nvidia Jetson
            jetson_usage = get_jetson_stats()

            if jetson_usage:
                stats["jetson-gpu"] = jetson_usage
            else:
                stats["jetson-gpu"] = {"gpu": "", "mem": ""}
                hwaccel_errors.append(args)
        elif "qsv" in args:
            if not config.telemetry.stats.intel_gpu_stats:
                continue

            # intel QSV GPU
            intel_usage = get_intel_gpu_stats()

            if intel_usage:
                stats["intel-qsv"] = intel_usage
            else:
                stats["intel-qsv"] = {"gpu": "", "mem": ""}
                hwaccel_errors.append(args)
        elif "vaapi" in args:
            if is_vaapi_amd_driver():
                if not config.telemetry.stats.amd_gpu_stats:
                    continue

                # AMD VAAPI GPU
                amd_usage = get_amd_gpu_stats()

                if amd_usage:
                    stats["amd-vaapi"] = amd_usage
                else:
                    stats["amd-vaapi"] = {"gpu": "", "mem": ""}
                    hwaccel_errors.append(args)
            else:
                if not config.telemetry.stats.intel_gpu_stats:
                    continue

                # intel VAAPI GPU
                intel_usage = get_intel_gpu_stats()

                if intel_usage:
                    stats["intel-vaapi"] = intel_usage
                else:
                    stats["intel-vaapi"] = {"gpu": "", "mem": ""}
                    hwaccel_errors.append(args)
        elif "v4l2m2m" in args or "rpi" in args:
            # RPi v4l2m2m is currently not able to get usage stats
            stats["rpi-v4l2m2m"] = {"gpu": "", "mem": ""}
        else: 
            stats["error-gpu"] = {"gpu": "", "mem": ""}

    if stats:
        all_stats["gpu_usages"] = stats


def stats_snapshot(
    config: VigisionConfig, stats_tracking: StatsTrackingTypes, hwaccel_errors: list[str]
) -> dict[str, Any]:
    """Get a snapshot of the current stats that are being tracked."""
    camera_metrics = stats_tracking["camera_metrics"]
    stats: dict[str, Any] = {}

    total_detection_fps = 0

    stats["cameras"] = {}
    for name, camera_stats in camera_metrics.items():
        total_detection_fps += camera_stats["detection_fps"].value
        pid = camera_stats["process"].pid if camera_stats["process"] else None
        ffmpeg_pid = (
            camera_stats["ffmpeg_pid"].value if camera_stats["ffmpeg_pid"] else None
        )
        cpid = (
            camera_stats["capture_process"].pid
            if camera_stats["capture_process"]
            else None
        )
        stats["cameras"][name] = {
            "camera_fps": round(camera_stats["camera_fps"].value, 2),
            "process_fps": round(camera_stats["process_fps"].value, 2),
            "skipped_fps": round(camera_stats["skipped_fps"].value, 2),
            "detection_fps": round(camera_stats["detection_fps"].value, 2),
            "detection_enabled": config.cameras[name].detect.enabled,
            "pid": pid,
            "capture_pid": cpid,
            "ffmpeg_pid": ffmpeg_pid,
            "audio_rms": round(camera_stats["audio_rms"].value, 4),
            "audio_dBFS": round(camera_stats["audio_dBFS"].value, 4),
        }

    stats["detectors"] = {}
    for name, detector in stats_tracking["detectors"].items():
        pid = detector.detect_process.pid if detector.detect_process else None
        stats["detectors"][name] = {
            "inference_speed": round(detector.avg_inference_speed.value * 1000, 2),  # type: ignore[attr-defined]
            # issue https://github.com/python/typeshed/issues/8799
            # from mypy 0.981 onwards
            "detection_start": detector.detection_start.value,  # type: ignore[attr-defined]
            # issue https://github.com/python/typeshed/issues/8799
            # from mypy 0.981 onwards
            "pid": pid,
        }
    stats["detection_fps"] = round(total_detection_fps, 2)

    get_processing_stats(config, stats, hwaccel_errors)

    stats["service"] = {
        "uptime": (int(time.time()) - stats_tracking["started"]),
        "version": VERSION,
        "latest_version": stats_tracking["latest_vigision_version"],
        "storage": {},
        "temperatures": get_temperatures(),
        "last_updated": int(time.time()),
    }

    for path in [RECORD_DIR, CLIPS_DIR, CACHE_DIR, "/dev/shm"]:
        try:
            storage_stats = shutil.disk_usage(path)
        except FileNotFoundError:
            stats["service"]["storage"][path] = {}
            continue

        stats["service"]["storage"][path] = {
            "total": round(storage_stats.total / pow(2, 20), 1),
            "used": round(storage_stats.used / pow(2, 20), 1),
            "free": round(storage_stats.free / pow(2, 20), 1),
            "mount_type": get_fs_type(path),
        }

    stats["processes"] = {}
    for name, pid in stats_tracking["processes"].items():
        stats["processes"][name] = {
            "pid": pid,
        }

    return stats
