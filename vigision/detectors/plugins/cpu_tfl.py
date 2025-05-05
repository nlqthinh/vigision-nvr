import logging

import numpy as np
from pydantic import Field
from typing_extensions import Literal

from vigision.detectors.detection_api import DetectionApi
from vigision.detectors.detector_config import BaseDetectorConfig
import cv2
import time

try:
    from tflite_runtime.interpreter import Interpreter
except ModuleNotFoundError:
    from tensorflow.lite.python.interpreter import Interpreter


logger = logging.getLogger(__name__)

DETECTOR_KEY = "cpu_tfl"


class CpuDetectorConfig(BaseDetectorConfig):
    type: Literal[DETECTOR_KEY]
    num_threads: int = Field(default=3, title="Number of detection threads")


class CpuTfl(DetectionApi):
    type_key = DETECTOR_KEY

    def __init__(self, detector_config: CpuDetectorConfig):
        self.interpreter = Interpreter(
            model_path=detector_config.model.path,
            num_threads=detector_config.num_threads or 3,
        )

        self.interpreter.allocate_tensors()

        self.tensor_input_details = self.interpreter.get_input_details()
        self.tensor_output_details = self.interpreter.get_output_details()
    
    def plot_detections(self, frame, detections):
        # print(frame.shape)
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
        # frame = tensor_input[0].copy()
        # start_t = time.time()

        self.interpreter.set_tensor(self.tensor_input_details[0]["index"], tensor_input)
        self.interpreter.invoke()

        boxes = self.interpreter.tensor(self.tensor_output_details[0]["index"])()[0]
        class_ids = self.interpreter.tensor(self.tensor_output_details[1]["index"])()[0]
        scores = self.interpreter.tensor(self.tensor_output_details[2]["index"])()[0]
        count = int(
            self.interpreter.tensor(self.tensor_output_details[3]["index"])()[0]
        )

        detections = np.zeros((20, 6), np.float32)

        for i in range(count):
            if scores[i] < 0.4 or i == 20:
                break
            # print(boxes[i])
            detections[i] = [
                class_ids[i],
                float(scores[i]),
                boxes[i][0],
                boxes[i][1],
                boxes[i][2],
                boxes[i][3],
            ]

        # frame_with_detections = self.plot_detections(frame, detections)
        # cv2.imwrite("debug/test.jpg", frame_with_detections)
        # time.sleep(1)
        # end_t = time.time()
        # print("Inference time: ", end_t - start_t)
        return detections