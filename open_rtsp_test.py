import cv2
import argparse

# Initialize ArgumentParser
parser = argparse.ArgumentParser(description="RTSP Viewer")

# Add an argument for RTSP URL
parser.add_argument("rtsp_url", help="RTSP URL of the video stream")

# Parse the command-line arguments
args = parser.parse_args()

# Create a window for displaying the video
cv2.namedWindow("RTSP View", cv2.WINDOW_NORMAL)

# Open the RTSP stream
cap = cv2.VideoCapture(args.rtsp_url)

while True:
    # Read frames from the stream
    ret, frame = cap.read()
    
    # Display the frame if read was successful
    if ret:
        cv2.imshow("RTSP View", frame)
        cv2.waitKey(1)
    else:
        print("Unable to open camera.")
        break

# Release the video capture object and close the OpenCV windows
cap.release()
cv2.destroyAllWindows()

# Example command: python open_rtsp.py rtsp://192.168.1.9:8554/vid4