import datetime
import logging
import multiprocessing as mp
import os
import queue
import signal
import subprocess as sp
import threading
import time
import torch
import numpy as np
import cv2
from setproctitle import setproctitle

from vigision.comms.config_updater import ConfigSubscriber
from vigision.comms.inter_process import InterProcessRequestor
from vigision.config import CameraConfig, DetectConfig, FallDetectConfig, ModelConfig
from vigision.const import (
    ALL_ATTRIBUTE_LABELS,
    ATTRIBUTE_LABEL_MAP,
    CACHE_DIR,
    CACHE_SEGMENT_FORMAT,
    CLIPS_DIR,
    REQUEST_REGION_GRID,
)
from vigision.detectors.detector_config import BaseDetectorConfig
from vigision.log import LogPipe
from vigision.motion import MotionDetector
from vigision.motion.improved_motion import ImprovedMotionDetector
from vigision.object_detection import RemoteObjectDetector
from vigision.ptz.autotrack import ptz_moving_at_frame_time
from vigision.track.norfair_tracker import NorfairTracker
from vigision.types import PTZMetricsTypes
from vigision.util.builtin import EventsPerSecond, get_tomorrow_at_time
from vigision.util.image import (
    FrameManager,
    SharedMemoryFrameManager,
    draw_box_with_label,
    intersection_over_union
)
from vigision.util.object import (
    box_inside,
    create_tensor_input,
    get_cluster_candidates,
    get_cluster_region,
    get_cluster_region_from_grid,
    get_min_region_size,
    get_startup_regions,
    inside_any,
    intersects_any,
    is_object_filtered,
    reduce_detections,
)
from vigision.util.services import listen
from vigision.pose_estimate_loader import SPPE_FastPose
from vigision.fall_detector_loader import TSSTG

logger = logging.getLogger(__name__)

OBJECT_TRACKER = "deepsort"

def stop_ffmpeg(ffmpeg_process, logger):
    logger.info("Terminating the existing ffmpeg process...")
    ffmpeg_process.terminate()
    try:
        logger.info("Waiting for ffmpeg to exit gracefully...")
        ffmpeg_process.communicate(timeout=30)
    except sp.TimeoutExpired:
        logger.info("FFmpeg didn't exit. Force killing...")
        ffmpeg_process.kill()
        ffmpeg_process.communicate()
    ffmpeg_process = None


def start_or_restart_ffmpeg(
    ffmpeg_cmd, logger, logpipe: LogPipe, frame_size=None, ffmpeg_process=None
):
    if ffmpeg_process is not None:
        stop_ffmpeg(ffmpeg_process, logger)

    if frame_size is None:
        process = sp.Popen(
            ffmpeg_cmd,
            stdout=sp.DEVNULL,
            stderr=logpipe,
            stdin=sp.DEVNULL,
            start_new_session=True,
        )
    else:
        process = sp.Popen(
            ffmpeg_cmd,
            stdout=sp.PIPE,
            stderr=logpipe,
            stdin=sp.DEVNULL,
            bufsize=frame_size * 10,
            start_new_session=True,
        )
    return process


def capture_frames(
    ffmpeg_process,
    camera_name,
    frame_shape,
    frame_manager: FrameManager,
    frame_queue,
    fps: mp.Value,
    skipped_fps: mp.Value,
    current_frame: mp.Value,
    stop_event: mp.Event,
):
    frame_size = frame_shape[0] * frame_shape[1]
    frame_rate = EventsPerSecond()
    frame_rate.start()
    skipped_eps = EventsPerSecond()
    skipped_eps.start()
    while True:
        fps.value = frame_rate.eps()
        skipped_fps.value = skipped_eps.eps()

        current_frame.value = datetime.datetime.now().timestamp()
        frame_name = f"{camera_name}{current_frame.value}"
        frame_buffer = frame_manager.create(frame_name, frame_size)
        try:
            frame_buffer[:] = ffmpeg_process.stdout.read(frame_size)
        except Exception:
            # shutdown has been initiated
            if stop_event.is_set():
                break
            logger.error(f"{camera_name}: Unable to read frames from ffmpeg process.")

            if ffmpeg_process.poll() is not None:
                logger.error(
                    f"{camera_name}: ffmpeg process is not running. exiting capture thread..."
                )
                frame_manager.delete(frame_name)
                break
            continue

        frame_rate.update()

        # don't lock the queue to check, just try since it should rarely be full
        try:
            # add to the queue
            frame_queue.put(current_frame.value, False)
            # close the frame
            frame_manager.close(frame_name)
        except queue.Full:
            # if the queue is full, skip this frame
            skipped_eps.update()
            frame_manager.delete(frame_name)


class CameraWatchdog(threading.Thread):
    def __init__(
        self,
        camera_name,
        config: CameraConfig,
        frame_queue,
        camera_fps,
        skipped_fps,
        ffmpeg_pid,
        stop_event,
    ):
        threading.Thread.__init__(self)
        self.logger = logging.getLogger(f"watchdog.{camera_name}")
        self.camera_name = camera_name
        self.config = config
        self.capture_thread = None
        self.ffmpeg_detect_process = None
        self.logpipe = LogPipe(f"ffmpeg.{self.camera_name}.detect")
        self.ffmpeg_other_processes: list[dict[str, any]] = []
        self.camera_fps = camera_fps
        self.skipped_fps = skipped_fps
        self.ffmpeg_pid = ffmpeg_pid
        self.frame_queue = frame_queue
        self.frame_shape = self.config.frame_shape_yuv
        self.frame_size = self.frame_shape[0] * self.frame_shape[1]
        self.stop_event = stop_event
        self.sleeptime = self.config.ffmpeg.retry_interval

    def run(self):
        self.start_ffmpeg_detect()

        for c in self.config.ffmpeg_cmds:
            if "detect" in c["roles"]:
                continue
            logpipe = LogPipe(
                f"ffmpeg.{self.camera_name}.{'_'.join(sorted(c['roles']))}"
            )
            self.ffmpeg_other_processes.append(
                {
                    "cmd": c["cmd"],
                    "roles": c["roles"],
                    "logpipe": logpipe,
                    "process": start_or_restart_ffmpeg(c["cmd"], self.logger, logpipe),
                }
            )

        time.sleep(self.sleeptime)
        while not self.stop_event.wait(self.sleeptime):
            now = datetime.datetime.now().timestamp()

            if not self.capture_thread.is_alive():
                self.camera_fps.value = 0
                self.logger.error(
                    f"Ffmpeg process crashed unexpectedly for {self.camera_name}."
                )
                self.logger.error(
                    "The following ffmpeg logs include the last 100 lines prior to exit."
                )
                self.logpipe.dump()
                self.start_ffmpeg_detect()
            elif now - self.capture_thread.current_frame.value > 20:
                self.camera_fps.value = 0
                self.logger.info(
                    f"No frames received from {self.camera_name} in 20 seconds. Exiting ffmpeg..."
                )
                self.ffmpeg_detect_process.terminate()
                try:
                    self.logger.info("Waiting for ffmpeg to exit gracefully...")
                    self.ffmpeg_detect_process.communicate(timeout=30)
                except sp.TimeoutExpired:
                    self.logger.info("FFmpeg did not exit. Force killing...")
                    self.ffmpeg_detect_process.kill()
                    self.ffmpeg_detect_process.communicate()
            elif self.camera_fps.value >= (self.config.detect.fps + 10):
                self.camera_fps.value = 0
                self.logger.info(
                    f"{self.camera_name} exceeded fps limit. Exiting ffmpeg..."
                )
                self.ffmpeg_detect_process.terminate()
                try:
                    self.logger.info("Waiting for ffmpeg to exit gracefully...")
                    self.ffmpeg_detect_process.communicate(timeout=30)
                except sp.TimeoutExpired:
                    self.logger.info("FFmpeg did not exit. Force killing...")
                    self.ffmpeg_detect_process.kill()
                    self.ffmpeg_detect_process.communicate()

            for p in self.ffmpeg_other_processes:
                poll = p["process"].poll()

                if self.config.record.enabled and "record" in p["roles"]:
                    latest_segment_time = self.get_latest_segment_datetime(
                        p.get(
                            "latest_segment_time",
                            datetime.datetime.now().astimezone(datetime.timezone.utc),
                        )
                    )

                    if datetime.datetime.now().astimezone(datetime.timezone.utc) > (
                        latest_segment_time + datetime.timedelta(seconds=120)
                    ):
                        self.logger.error(
                            f"No new recording segments were created for {self.camera_name} in the last 120s. restarting the ffmpeg record process..."
                        )
                        p["process"] = start_or_restart_ffmpeg(
                            p["cmd"],
                            self.logger,
                            p["logpipe"],
                            ffmpeg_process=p["process"],
                        )
                        continue
                    else:
                        p["latest_segment_time"] = latest_segment_time

                if poll is None:
                    continue

                p["logpipe"].dump()
                p["process"] = start_or_restart_ffmpeg(
                    p["cmd"], self.logger, p["logpipe"], ffmpeg_process=p["process"]
                )

        stop_ffmpeg(self.ffmpeg_detect_process, self.logger)
        for p in self.ffmpeg_other_processes:
            stop_ffmpeg(p["process"], self.logger)
            p["logpipe"].close()
        self.logpipe.close()

    def start_ffmpeg_detect(self):
        ffmpeg_cmd = [
            c["cmd"] for c in self.config.ffmpeg_cmds if "detect" in c["roles"]
        ][0]
        self.ffmpeg_detect_process = start_or_restart_ffmpeg(
            ffmpeg_cmd, self.logger, self.logpipe, self.frame_size
        )
        self.ffmpeg_pid.value = self.ffmpeg_detect_process.pid
        self.capture_thread = CameraCapture(
            self.camera_name,
            self.ffmpeg_detect_process,
            self.frame_shape,
            self.frame_queue,
            self.camera_fps,
            self.skipped_fps,
            self.stop_event,
        )
        self.capture_thread.start()

    def get_latest_segment_datetime(self, latest_segment: datetime.datetime) -> int:
        """Checks if ffmpeg is still writing recording segments to cache."""
        cache_files = sorted(
            [
                d
                for d in os.listdir(CACHE_DIR)
                if os.path.isfile(os.path.join(CACHE_DIR, d))
                and d.endswith(".mp4")
                and not d.startswith("preview_")
            ]
        )
        newest_segment_time = latest_segment

        for file in cache_files:
            if self.camera_name in file:
                basename = os.path.splitext(file)[0]
                _, date = basename.rsplit("@", maxsplit=1)
                segment_time = datetime.datetime.strptime(
                    date, CACHE_SEGMENT_FORMAT
                ).astimezone(datetime.timezone.utc)
                if segment_time > newest_segment_time:
                    newest_segment_time = segment_time

        return newest_segment_time


class CameraCapture(threading.Thread):
    def __init__(
        self,
        camera_name,
        ffmpeg_process,
        frame_shape,
        frame_queue,
        fps,
        skipped_fps,
        stop_event,
    ):
        threading.Thread.__init__(self)
        self.name = f"capture:{camera_name}"
        self.camera_name = camera_name
        self.frame_shape = frame_shape
        self.frame_queue = frame_queue
        self.fps = fps
        self.stop_event = stop_event
        self.skipped_fps = skipped_fps
        self.frame_manager = SharedMemoryFrameManager()
        self.ffmpeg_process = ffmpeg_process
        self.current_frame = mp.Value("d", 0.0)
        self.last_frame = 0

    def run(self):
        capture_frames(
            self.ffmpeg_process,
            self.camera_name,
            self.frame_shape,
            self.frame_manager,
            self.frame_queue,
            self.fps,
            self.skipped_fps,
            self.current_frame,
            self.stop_event,
        )


def capture_camera(name, config: CameraConfig, process_info):
    stop_event = mp.Event()

    def receiveSignal(signalNumber, frame):
        logger.debug(f"Capture camera received signal {signalNumber}")
        stop_event.set()

    signal.signal(signal.SIGTERM, receiveSignal)
    signal.signal(signal.SIGINT, receiveSignal)

    threading.current_thread().name = f"capture:{name}"
    setproctitle(f"vigision.capture:{name}")

    frame_queue = process_info["frame_queue"]
    camera_watchdog = CameraWatchdog(
        name,
        config,
        frame_queue,
        process_info["camera_fps"],
        process_info["skipped_fps"],
        process_info["ffmpeg_pid"],
        stop_event,
    )
    camera_watchdog.start()
    camera_watchdog.join()


def track_camera(
    name,
    config: CameraConfig,
    detector_config,
    model_config,
    labelmap,
    detection_queue,
    result_connection,
    detected_objects_queue,
    process_info,
    ptz_metrics,
    region_grid,
):
    stop_event = mp.Event()

    def receiveSignal(signalNumber, frame):
        stop_event.set()

    signal.signal(signal.SIGTERM, receiveSignal)
    signal.signal(signal.SIGINT, receiveSignal)

    threading.current_thread().name = f"process:{name}"
    setproctitle(f"vigision.process:{name}")
    listen()

    frame_queue = process_info["frame_queue"]

    frame_shape = config.frame_shape
    objects_to_track = config.objects.track
    object_filters = config.objects.filters

    motion_detector = ImprovedMotionDetector(
        frame_shape, config.motion, config.detect.fps, name=config.name
    )
    object_detector = RemoteObjectDetector(
        name, labelmap, detection_queue, result_connection, model_config, stop_event
    )
    object_tracker = NorfairTracker(config, ptz_metrics)

    frame_manager = SharedMemoryFrameManager()

    # create communication for region grid updates
    requestor = InterProcessRequestor()
    fall_detect_config = config.fall_detect
    pose_model = None
    fall_model = None
    if (fall_detect_config.enabled):
        t_device = "cpu"
        if detector_config["detector_name"].type == "gpu":
            t_device = 'cuda'
        pose_model = SPPE_FastPose('resnet50', 320, 256, device=t_device)
        fall_model = TSSTG(weight_file='vigision/models/gcn/hfd_30frames.pth', device=t_device)

    process_frames(
        name,
        requestor,
        frame_queue,
        frame_shape,
        detector_config,
        model_config,
        fall_detect_config,
        config.detect,
        frame_manager,
        motion_detector,
        object_detector,
        pose_model,
        fall_model,
        object_tracker,
        detected_objects_queue,
        process_info,
        objects_to_track,
        object_filters,
        stop_event,
        ptz_metrics,
        region_grid,
    )
   
    # empty the frame queue
    logger.info(f"{name}: emptying frame queue")
    while not frame_queue.empty():
        frame_time = frame_queue.get(False)
        frame_manager.delete(f"{name}{frame_time}")

    logger.info(f"{name}: exiting subprocess")


def detect(
    detect_config: DetectConfig,
    object_detector,
    frame,
    model_config,
    detector_config,
    region,
    objects_to_track,
    object_filters,
    expand_bb = 0
):
    tensor_input = create_tensor_input(frame, model_config, detector_config, region)
    detections = []
    region_detections = object_detector.detect(tensor_input)
    for d in region_detections:
        box = d[2]
        size = region[2] - region[0]
        x_min = int(max(0, (box[1] * size) + region[0] - expand_bb))
        y_min = int(max(0, (box[0] * size) + region[1]) - expand_bb)
        x_max = int(min(detect_config.width - 1, (box[3] * size) + region[0] + expand_bb))
        y_max = int(min(detect_config.height - 1, (box[2] * size) + region[1] + expand_bb))

        # ignore objects that were detected outside the frame
        if (x_min >= detect_config.width - 1) or (y_min >= detect_config.height - 1):
            continue

        width = x_max - x_min
        height = y_max - y_min
        area = width * height
        ratio = width / max(1, height)
        det = (
            d[0],
            d[1],
            (x_min, y_min, x_max, y_max),
            area,
            ratio,
            region,
        )
        # apply object filters
        if is_object_filtered(det, objects_to_track, object_filters):
            continue
        detections.append(det)
    return detections

def get_encompassing_square(regions):
    if not regions:
        return (0,0,2000,2000)

    # Initialize with the first region's coordinates
    min_x = min(regions[0][0], regions[0][2])
    min_y = min(regions[0][1], regions[0][3])
    max_x = max(regions[0][0], regions[0][2])
    max_y = max(regions[0][1], regions[0][3])

    # Iterate through all regions to find the extremes
    for region in regions[1:]:
        min_x = min(min_x, region[0], region[2])
        min_y = min(min_y, region[1], region[3])
        max_x = max(max_x, region[0], region[2])
        max_y = max(max_y, region[1], region[3])

    # Calculate the side length of the square
    side_length = max(max_x - min_x, max_y - min_y)

    # Adjust side length to be divisible by 4
    side_length = ((side_length + 3) // 4) * 4

    # Adjust max_x and max_y to ensure a square with side length divisible by 4
    max_x = min_x + side_length
    max_y = min_y + side_length

    # Return the encompassing square as (top_left_x, top_left_y, bottom_right_x, bottom_right_y)
    return (min_x, min_y, max_x, max_y)

if True:
    
  
    COCO_PAIR = [(0, 13), (1, 2), (1, 3), (3, 5), (2, 4), (4, 6), (13, 7), (13, 8),  # Body
                (7, 9), (8, 10), (9, 11), (10, 12)]
    POINT_COLORS = [(0, 255, 255), (0, 191, 255), (0, 255, 102), (0, 77, 255), (0, 255, 0),  # Nose, LEye, REye, LEar, REar
                    (77, 255, 255), (77, 255, 204), (77, 204, 255), (191, 255, 77), (77, 191, 255), (191, 255, 77),  # LShoulder, RShoulder, LElbow, RElbow, LWrist, RWrist
                    (204, 77, 255), (77, 255, 204), (191, 77, 255), (77, 255, 191), (127, 77, 255), (77, 255, 127), (0, 255, 255)]  # LHip, RHip, LKnee, Rknee, LAnkle, RAnkle, Neck
    LINE_COLORS_GREEN = [(0, 255, 0), (0, 255, 0), (0, 255, 0), (0, 255, 0), (0, 255, 0),
                (0, 255, 0), (0, 255, 0), (0, 255, 0), (0, 255, 0), (0, 255, 0),
                (0, 255, 0), (0, 255, 0), (0, 255, 0), (0, 255, 0), (0, 255, 0), (0, 255, 0)]
    LINE_COLORS_RED = [(255, 0, 0), (255, 0, 0), (255, 0, 0), (255, 0, 0), (255, 0, 0),
                (255, 0, 0), (255, 0, 0), (255, 0, 0), (255, 0, 0), (255, 0, 0),
                (255, 0, 0), (255, 0, 0), (255, 0, 0), (255, 0, 0), (255, 0, 0), (255, 0, 0)]

    MPII_PAIR = [(8, 9), (11, 12), (11, 10), (2, 1), (1, 0), (13, 14), (14, 15), (3, 4), (4, 5),
                (8, 7), (7, 6), (6, 2), (6, 3), (8, 12), (8, 13)]
    RED = (0, 0, 255)
    GREEN = (0, 255, 0)
    BLUE = (255, 0, 0)
    CYAN = (255, 255, 0)
    YELLOW = (0, 255, 255)
    ORANGE = (0, 165, 255)
    PURPLE = (255, 0, 255)

    def draw_single(frame, pts, joint_format='coco', is_red = False):
        if joint_format == 'coco':
            l_pair = COCO_PAIR
            p_color = POINT_COLORS
            if (is_red):
                line_color = LINE_COLORS_RED
            else:
                line_color = LINE_COLORS_GREEN
        elif joint_format == 'mpii':
            l_pair = MPII_PAIR
            p_color = [PURPLE, BLUE, BLUE, RED, RED, BLUE, BLUE, RED, RED, PURPLE, PURPLE, PURPLE, RED, RED,BLUE,BLUE]
        else:
            NotImplementedError

        part_line = {}
        pts = np.concatenate((pts, np.expand_dims((pts[1, :] + pts[2, :]) / 2, 0)), axis=0)
        for n in range(pts.shape[0]):
            if pts[n, 2] <= 0.05:
                continue
            cor_x, cor_y = int(pts[n, 0]), int(pts[n, 1])
            part_line[n] = (cor_x, cor_y)
            cv2.circle(frame, (cor_x, cor_y), 3, p_color[n], -1)

        for i, (start_p, end_p) in enumerate(l_pair):
            if start_p in part_line and end_p in part_line:
                start_xy = part_line[start_p]
                end_xy = part_line[end_p]
                cv2.line(frame, start_xy, end_xy, line_color[i], int(1*(pts[start_p, 2] + pts[end_p, 2]) + 1))
        return frame

def process_frames(
    camera_name: str,
    requestor: InterProcessRequestor,
    frame_queue: mp.Queue,
    frame_shape,
    detector_config: BaseDetectorConfig,
    model_config: ModelConfig,
    fall_detect_config: FallDetectConfig,
    detect_config: DetectConfig,
    frame_manager: FrameManager,
    motion_detector: MotionDetector,
    object_detector: RemoteObjectDetector,
    pose_model,
    action_model,
    object_tracker,
    detected_objects_queue: mp.Queue,
    process_info: dict,
    objects_to_track: list[str],
    object_filters,
    stop_event,
    ptz_metrics: PTZMetricsTypes,
    region_grid,
    exit_on_empty: bool = False,
):
    fps = process_info["process_fps"]
    detection_fps = process_info["detection_fps"]
    current_frame_time = process_info["detection_frame"]
    next_region_update = get_tomorrow_at_time(2)
    config_subscriber = ConfigSubscriber(f"config/detect/{camera_name}")
    fps_tracker = EventsPerSecond()
    fps_tracker.start()
    startup_scan = True
    stationary_frame_counter = 0
    region_min_size = get_min_region_size(model_config)

    while not stop_event.is_set():
        # check for updated detect config
        _, updated_detect_config = config_subscriber.check_for_update()

        if updated_detect_config:
            detect_config = updated_detect_config

        if (
            datetime.datetime.now().astimezone(datetime.timezone.utc)
            > next_region_update
        ):
            region_grid = requestor.send_data(REQUEST_REGION_GRID, camera_name)
            next_region_update = get_tomorrow_at_time(2)

        try:
            if exit_on_empty:
                frame_time = frame_queue.get(False)
            else:
                frame_time = frame_queue.get(True, 1)
        except queue.Empty:
            if exit_on_empty:
                logger.info("Exiting track_objects...")
                break
            continue

        current_frame_time.value = frame_time
        ptz_metrics["ptz_frame_time"].value = frame_time

        frame = frame_manager.get(
            f"{camera_name}{frame_time}", (frame_shape[0] * 3 // 2, frame_shape[1])
        )

        if frame is None:
            logger.info(f"{camera_name}: frame {frame_time} is not in memory store.")
            continue
        debug_frame = cv2.cvtColor(frame.copy(), cv2.COLOR_YUV2BGR_I420)
        bgr_frame = cv2.cvtColor(frame.copy(), cv2.COLOR_YUV2BGR_I420)

        # look for motion if enabled
        motion_boxes = motion_detector.detect(frame)

        regions = []
        consolidated_detections = []

        # if detection is disabled
        if not detect_config.enabled:
            object_tracker.match_and_update(frame_time, [])
        else:
            if stationary_frame_counter == detect_config.stationary.interval:
                stationary_frame_counter = 0
                stationary_object_ids = []
            else:
                stationary_frame_counter += 1

                stationary_object_ids = [
                    obj["id"]
                    for obj in object_tracker.tracked_objects.values()
                    # if it has exceeded the stationary threshold
                    if obj["motionless_count"] >= detect_config.stationary.threshold
                    # and it hasn't disappeared
                    and object_tracker.disappeared[obj["id"]] == 0
                    # and it doesn't overlap with any current motion boxes when not calibrating
                    and not intersects_any(
                        obj["box"],
                        [] if motion_detector.is_calibrating() else motion_boxes,
                    )
                ]

            # get tracked object boxes that aren't stationary
            tracked_object_boxes = [
                (
                    # use existing object box for stationary objects
                    obj["estimate"]
                    if obj["motionless_count"] < detect_config.stationary.threshold
                    else obj["box"]
                )
                for obj in object_tracker.tracked_objects.values()
                if obj["id"] not in stationary_object_ids
            ]
            object_boxes = tracked_object_boxes + object_tracker.untracked_object_boxes

            # get consolidated regions for tracked objects
            regions = [
                get_cluster_region(
                    frame_shape, region_min_size, candidate, object_boxes
                )
                for candidate in get_cluster_candidates(
                    frame_shape, region_min_size, object_boxes
                )
            ]

            # only add in the motion boxes when not calibrating and a ptz is not moving via autotracking
            # ptz_moving_at_frame_time() always returns False for non-autotracking cameras
            if not motion_detector.is_calibrating() and not ptz_moving_at_frame_time(
                frame_time,
                ptz_metrics["ptz_start_time"].value,
                ptz_metrics["ptz_stop_time"].value,
            ):
                # find motion boxes that are not inside tracked object regions
                standalone_motion_boxes = [
                    b for b in motion_boxes if not inside_any(b, regions)
                ]

                if standalone_motion_boxes:
                    motion_clusters = get_cluster_candidates(
                        frame_shape,
                        region_min_size,
                        standalone_motion_boxes,
                    )
                    motion_regions = [
                        get_cluster_region_from_grid(
                            frame_shape,
                            region_min_size,
                            candidate,
                            standalone_motion_boxes,
                            region_grid,
                        )
                        for candidate in motion_clusters
                    ]
                    regions += motion_regions

            # if starting up, get the next startup scan region
            if startup_scan:
                for region in get_startup_regions(
                    frame_shape, region_min_size, region_grid
                ):
                    regions.append(region)
                startup_scan = False

            # resize regions and detect
            # seed with stationary objects
            # regions = [(0, 0, frame_shape[1], frame_shape[1])]
            regions = [get_encompassing_square(regions)]

            detections = [
                (
                    obj["label"],
                    obj["score"],
                    obj["box"],
                    obj["area"],
                    obj["ratio"],
                    obj["region"],
                )
                for obj in object_tracker.tracked_objects.values()
                if obj["id"] in stationary_object_ids
            ]

            for region in regions:
                detections.extend(
                    detect(
                        detect_config,
                        object_detector,
                        frame,
                        model_config,
                        detector_config,
                        region,
                        objects_to_track,
                        object_filters,
                        expand_bb = 10
                    )
                )

            consolidated_detections = reduce_detections(frame_shape, detections)

            # if detection was run on this frame, consolidate
            if len(regions) > 0:
                tracked_detections = [
                    d
                    for d in consolidated_detections
                ]
                object_tracker.match_and_update(frame_time, tracked_detections)
            # else, just update the frame times for the stationary objects
            else:
                object_tracker.update_frame_times(frame_time)
                
        # object_tracker.debug_draw(debug_frame, frame_time)
        # cv2.imwrite(f"debug/track.jpg", debug_frame)

        # build detections and add attributes
        detections = {}
        pose_input = None
        box_id_map = {}
        for est_obj in object_tracker.tracker.tracked_objects:
            fall_data = None

            if (est_obj.id in object_tracker.track_id_map):
                obj = object_tracker.tracked_objects[object_tracker.track_id_map[est_obj.id]]
                est_box = obj["box"]
                if obj["frame_time"] != frame_time:
                    pred_box = tuple(map(int, est_obj.estimate.astype(int).ravel()))
                    x_min, y_min = min(est_box[0], pred_box[0]), min(est_box[1], pred_box[1])
                    x_max, y_max = max(est_box[2], pred_box[2]), max(est_box[3], pred_box[3])

                    # Adjust the bounding box coordinates with padding and ensure they remain within frame boundaries
                    x_min = max(0, x_min - 20)
                    y_min = max(0, y_min - 20)
                    x_max = min(frame_shape[1], x_max + 20)
                    y_max = min(frame_shape[0], y_max + 20)

                    # Update the estimate box
                    est_box = (x_min, y_min, x_max, y_max)
                
                if (fall_detect_config.enabled and obj["label"] == "person"):
                    est_score = obj["score"] if obj["frame_time"] == frame_time else 0.5

                    det = torch.tensor([list(est_box) + [est_score, 1.0, 0.0]], dtype=torch.float32)
                    box_id_map[tuple(est_box)] = obj["id"]
                    pose_input = torch.cat([pose_input, det], dim=0) if pose_input is not None else det
                    # snapshot_filename = None

                    if len(object_tracker.key_points[obj["id"]]) == 30:
                        pts = np.array(object_tracker.key_points[obj["id"]], dtype=np.float32)
                        out = action_model.predict(pts, frame.shape[:2])
                        # if (action_model.class_names[out[0].argmax()] == "Fall"):
                        #     # save snapshot
                        #     snapshot_filename = os.path.join(
                        #         CLIPS_DIR, f"review/thumb-{camera_name}-{frame_time}.webp"
                        #     )
                        #     cv2.imwrite(snapshot_filename, bgr_frame)
                        fall_data = {
                            "label": action_model.class_names[out[0].argmax()],
                            "score": out[0].max().item(),
                            "box": est_box,
                            "pose": object_tracker.key_points[obj["id"]][-1].tolist(),
                            # "snapshot": snapshot_filename
                        }
                    elif len(object_tracker.key_points[obj["id"]]) > 0:
                        fall_data = {
                            "label": "unknown",
                            "score": 0.0,
                            "box": est_box,
                            "pose": object_tracker.key_points[obj["id"]][-1].tolist(),
                            # "snapshot": snapshot_filename
                        }
                detections[obj["id"]] = {**obj, "estimated_box": est_box,
                                         "attributes": [], "fall_data": fall_data}
        
        if (pose_input is not None):
            poses = pose_model.predict(bgr_frame, pose_input[:, 0:4], pose_input[:, 4])
            for pose in poses:
                kps = np.concatenate((pose['keypoints'].numpy(),
                                                    pose['kp_score'].numpy()), axis=1)
                object_tracker.update_pose_data(box_id_map[tuple(map(int, pose['bbox'].numpy().tolist()))], kps)
                
        # debug object tracking
        # cv2.imwrite(f"debug/track.jpg", debug_frame)

        if False:
            bgr_frame = cv2.cvtColor(
                frame,
                cv2.COLOR_YUV2BGR_I420,
            )
            object_tracker.debug_draw(bgr_frame, frame_time)
            cv2.imwrite(
                f"debug/frames/track-{'{:.6f}'.format(frame_time)}.jpg", bgr_frame
            )
        # debug
        if False:
            bgr_frame = cv2.cvtColor(
                frame,
                cv2.COLOR_YUV2BGR_I420,
            )

            for m_box in motion_boxes:
                cv2.rectangle(
                    bgr_frame,
                    (m_box[0], m_box[1]),
                    (m_box[2], m_box[3]),
                    (0, 0, 255),
                    2,
                )

            for b in tracked_object_boxes:
                cv2.rectangle(
                    bgr_frame,
                    (b[0], b[1]),
                    (b[2], b[3]),
                    (255, 0, 0),
                    2,
                )

            for obj in object_tracker.tracked_objects.values():
                if obj["frame_time"] == frame_time:
                    thickness = 2
                    color = model_config.colormap[obj["label"]]
                else:
                    thickness = 1
                    color = (255, 0, 0)

                # draw the bounding boxes on the frame
                box = obj["box"]

                draw_box_with_label(
                    bgr_frame,
                    box[0],
                    box[1],
                    box[2],
                    box[3],
                    obj["label"],
                    obj["id"],
                    thickness=thickness,
                    color=color,
                )

            for region in regions:
                cv2.rectangle(
                    bgr_frame,
                    (region[0], region[1]),
                    (region[2], region[3]),
                    (0, 255, 0),
                    2,
                )

            cv2.imwrite(
                f"debug/frames/{camera_name}-{'{:.6f}'.format(frame_time)}.jpg",
                bgr_frame,
            )
        # add to the queue if not full
        if detected_objects_queue.full():
            frame_manager.delete(f"{camera_name}{frame_time}")
            continue
        else:
            fps_tracker.update()
            fps.value = fps_tracker.eps()
            detected_objects_queue.put(
                (
                    camera_name,
                    frame_time,
                    detections,
                    motion_boxes,
                    regions,
                )
            )
            detection_fps.value = object_detector.fps.eps()
            frame_manager.close(f"{camera_name}{frame_time}")

    motion_detector.stop()
    requestor.stop()
    config_subscriber.stop()
