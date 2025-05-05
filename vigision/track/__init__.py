from abc import ABC, abstractmethod

from vigision.config import DetectConfig


class ObjectTracker(ABC):
    @abstractmethod
    def __init__(self, config: DetectConfig) -> None:
        pass

    @abstractmethod
    def match_and_update(self, frame_time: float, detections, fall_detect_data=None) -> None:
        pass
