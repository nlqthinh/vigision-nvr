import faulthandler
import threading
from flask import cli
from vigision.app import VigisionApp
import gdown
import os
import subprocess

faulthandler.enable()

threading.current_thread().name = "vigision"

cli.show_server_banner = lambda *x: None

if __name__ == "__main__":

    model_files = [
        ('https://drive.google.com/uc?id=1PYl4-15xMd7LEf6cKIyldORyHzxdPzD5', 'vigision/models/gcn/OSA_STGCN_nano_1S_best.pth'),
        ('https://drive.google.com/uc?id=1pU0ezrYzXjoFJ6okqMN89WlRvxOYwPuw', 'vigision/models/sppe/fast_res50_256x192.pth'),
        ('https://drive.google.com/uc?id=1lIGFZ4NWk3RpRH9Ik6Ofu6WF-nkg7nWV', 'vigision/models/yolo/yolov8n.pt'),
        ('https://drive.google.com/uc?id=1cAKVCyHBbtZpOPSiavplIihYMtHRiCZX', 'vigision/models/yolo/yolov8n_fp16.engine'),
        ('https://drive.google.com/uc?id=16-NhaARByL5Tcid5rHEycakQoOqjhJK4', 'vigision/models/yolo/yolov8n_fp16.onnx'),
        ('https://drive.google.com/uc?id=1Km59V8aumFJ4cJq8TaAXYnFtUGX-MLjN', 'vigision/models/gcn/hfd_30frames.pth'),
    ]
    for url, filepath in model_files:
        directory = os.path.dirname(filepath)
        if not os.path.exists(directory):
            os.makedirs(directory)
        if not os.path.exists(filepath):
            gdown.download(url, filepath, quiet=False)
    
    vigision_app = VigisionApp()
    # Define the script to be run
    
    scripts_to_run = [
        "email_migration_script.py",
        "otp_migration_script.py",
        "receive_alert_migration_script.py",
        "token_jti_migration_script.py"
    ]

    # Iterate over the list and run each script
    for script in scripts_to_run:
        try:
            # Running the script and waiting for it to complete
            result = subprocess.run(["python3", script], capture_output=True, text=True)
        except Exception as e:
            pass        
    vigision_app.start()
