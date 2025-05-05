import CameraImage from "./CameraImage";

type AutoUpdatingCameraImageProps = {
  camera: string;
  searchParams?: URLSearchParams;
  showFps?: boolean;
  className?: string;
  cameraClasses?: string;
  fps?: number;
};

export default function AutoUpdatingCameraImage({
  camera,
  searchParams = undefined,
  showFps = true,
  className,
  cameraClasses,
  fps = 15,
}: AutoUpdatingCameraImageProps) {
  return (
    <div className={className}>
      <CameraImage
        camera={camera}
        searchParams={`${searchParams ? `&${searchParams}` : ""}`}
        className={cameraClasses}
        fps={fps}
      />
      {showFps ? <span className="text-xs">Streaming at {fps}fps</span> : null}
    </div>
  );
}