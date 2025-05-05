import logging

import numpy as np
from pydantic import Field
from typing_extensions import Literal

from vigision.detectors.detection_api import DetectionApi
from vigision.detectors.detector_config import BaseDetectorConfig
import cv2
import time
from ultralytics import YOLO
# import torch

logger = logging.getLogger(__name__)

DETECTOR_KEY = "gpu"

class GpuDetectorConfig(BaseDetectorConfig):
    type: Literal[DETECTOR_KEY]
    num_threads: int = Field(default=3, title="Number of detection threads")

class GpuDetector(DetectionApi):
    type_key = DETECTOR_KEY

    def __init__(self, detector_config: GpuDetectorConfig):
        # torch.cuda.set_device(0)
        # device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        # print("Device: ", device)
        self.model = YOLO("vigision/models/yolo/yolov8n_fp16.engine", task="detect", verbose=False)
        self.total_inference_time = 0
        self.num_inference = 0

    def plot_detections(self, frame, detections):
        for detection in detections:
            class_id, score, y_min, x_min, y_max, x_max = detection
            if score == 0:
                continue
            start_point = (int(x_min * frame.shape[1]), int(y_min * frame.shape[0]))
            end_point = (int(x_max * frame.shape[1]), int(y_max * frame.shape[0]))
            color = (0, 255, 0) # Green
            thickness = 2
            frame = cv2.rectangle(frame, start_point, end_point, color, thickness)
            label = f'Class {int(class_id)}: {score:.2f}'
            label_position = (start_point[0], start_point[1] - 10)
            frame = cv2.putText(frame, label, label_position, cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
        return frame


    def detect_raw(self, tensor_input):
        # print(tensor_input.shape) # shape: (1, 640, 640, 3)
        frame = tensor_input[0].copy()
        # start_t = time.time()
        results = self.model(frame, verbose=False)
        # results = self.model.predict(tensor_input[0], imgsz = 320, verbose=False)

        detections = np.zeros((20, 6), np.float32)
        for result in results:
            boxes = np.array(result.boxes.xyxyn.cpu())
            scores = np.array(result.boxes.conf.cpu())
            class_ids = np.array(result.boxes.cls.cpu())
            count = len(boxes)

            for i in range(count):
                if i == 20:
                    break
                # print(boxes[i])
                detections[i] = [
                    class_ids[i],
                    float(scores[i]),
                    boxes[i][1],
                    boxes[i][0],
                    boxes[i][3],
                    boxes[i][2],
                ]
            # frame_with_detections = self.plot_detections(tensor_input[0].copy(), detections)
            # cv2.imwrite("debug/test.jpg", frame_with_detections)
        # frame_with_detections = results[0].plot()
        # class_idx = results[0].boxes.cls.cpu()
        # print("Class idx: ", class_idx)
        # cv2.imwrite("debug/test.jpg", frame_with_detections)
        # time.sleep(1)
        # end_t = time.time()

        # print("Inference time GPU: ", end_t - start_t)
        # self.total_inference_time += end_t - start_t
        # self.num_inference += 1
        # print("Average inference time: ", self.total_inference_time / self.num_inference)
        return detections

