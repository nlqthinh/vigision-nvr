#fp32
# yolo export model=vigision/models/yolo/yolov8n.pt format=engine device=0 workspace=12

# fp16
yolo export model=yolov8n.pt format=engine half=True device=0 workspace=12

# int8
# yolo export model=vigision/models/yolo/yolov8n.pt format=engine dynamic=True int8=True data="coco.yaml" device=0 workspace=12

