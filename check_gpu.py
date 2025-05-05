import torch

def check_gpu_pytorch():
    if torch.cuda.is_available():
        print("GPU is available")
    else:
        print("GPU is not available")

check_gpu_pytorch()