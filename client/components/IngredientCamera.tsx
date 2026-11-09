import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useModalDialog } from '../hooks/useModalDialog';
import './IngredientCamera.css';

export default function IngredientCamera({
    mode,
    onClose,
    onContinue,
}: {
    mode: 'food' | 'label';
    onClose: () => void;
    onContinue: (photo: string) => void;
}) {
    const dialogRef = useModalDialog();
    const videoRef = useRef<HTMLVideoElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [ready, setReady] = useState(false);
    const [preview, setPreview] = useState<string | null>(null);
    const [cameraError, setCameraError] = useState('');
    const [flashAvailable, setFlashAvailable] = useState(false);
    const [flashOn, setFlashOn] = useState(false);
    const title = mode === 'label' ? 'Scan Nutrition Label' : 'Take a photo';

    useEffect(() => {
        let mounted = true;
        async function startCamera() {
            if (!navigator.mediaDevices?.getUserMedia) {
                setCameraError(
                    'Camera unavailable. Choose a photo from your library instead.',
                );
                return;
            }
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: false,
                    video: { facingMode: { ideal: 'environment' } },
                });
                if (!mounted) {
                    stream.getTracks().forEach((track) => track.stop());
                    return;
                }
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    void videoRef.current.play().catch(() => {
                        setCameraError(
                            'Camera preview could not start. Choose a photo instead.',
                        );
                    });
                }
                const track = stream.getVideoTracks()[0];
                const capabilities = track?.getCapabilities?.() as
                    (MediaTrackCapabilities & { torch?: boolean }) | undefined;
                setFlashAvailable(Boolean(capabilities?.torch));
            } catch {
                if (mounted)
                    setCameraError(
                        'Camera unavailable. Choose a photo from your library instead.',
                    );
            }
        }
        void startCamera();
        return () => {
            mounted = false;
            streamRef.current?.getTracks().forEach((track) => track.stop());
        };
    }, []);

    function capture() {
        const video = videoRef.current;
        if (!video?.videoWidth || !video.videoHeight) return;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d')?.drawImage(video, 0, 0);
        setPreview(canvas.toDataURL('image/jpeg', 0.9));
    }

    async function toggleFlash() {
        const track = streamRef.current?.getVideoTracks()[0];
        if (!track || !flashAvailable) return;
        try {
            await track.applyConstraints({
                advanced: [{ torch: !flashOn } as MediaTrackConstraintSet],
            });
            setFlashOn((current) => !current);
        } catch {
            setFlashAvailable(false);
        }
    }

    return createPortal(
        <dialog
            ref={dialogRef}
            className="ingredient-camera"
            aria-label={title}
            onCancel={(event) => {
                event.preventDefault();
                onClose();
            }}
        >
            <header className="ingredient-camera-header">
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Back to My Ingredients"
                >
                    ‹
                </button>
                <h2>{title}</h2>
            </header>
            <div className="ingredient-camera-view">
                <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    onLoadedMetadata={() => setReady(true)}
                    aria-label="Camera preview"
                />
                {preview && <img src={preview} alt="Captured ingredient" />}
                {!preview && mode === 'label' && (
                    <div className="ingredient-camera-frame" aria-hidden="true">
                        <span />
                        <span />
                        <span />
                        <span />
                    </div>
                )}
                {!preview && cameraError && (
                    <p className="ingredient-camera-error" role="status">
                        {cameraError}
                    </p>
                )}
                {!preview && !cameraError && (
                    <p className="ingredient-camera-guide">
                        {mode === 'label'
                            ? 'Place the nutrition label inside the frame'
                            : 'Center your ingredient in the frame'}
                    </p>
                )}
            </div>
            <div className="ingredient-camera-controls">
                {preview ? (
                    <>
                        <button
                            type="button"
                            className="ingredient-camera-secondary"
                            onClick={() => setPreview(null)}
                        >
                            Retake
                        </button>
                        <button
                            type="button"
                            className="ingredient-camera-continue"
                            onClick={() => preview && onContinue(preview)}
                        >
                            Enter details
                        </button>
                    </>
                ) : (
                    <>
                        <button
                            type="button"
                            className="ingredient-camera-side"
                            onClick={() => inputRef.current?.click()}
                            aria-label="Choose photo from library"
                            title="Choose photo from library"
                        >
                            <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                aria-hidden="true"
                            >
                                <rect
                                    x="3"
                                    y="4"
                                    width="18"
                                    height="16"
                                    rx="2"
                                />
                                <circle cx="8" cy="9" r="1.5" />
                                <path d="m4 17 5-5 4 4 3-3 4 4" />
                            </svg>
                        </button>
                        <button
                            type="button"
                            className="ingredient-camera-shutter"
                            onClick={capture}
                            disabled={!ready}
                            aria-label="Capture photo"
                        />
                        <button
                            type="button"
                            className="ingredient-camera-side"
                            onClick={() => void toggleFlash()}
                            disabled={!flashAvailable}
                            aria-label={
                                flashOn ? 'Turn flash off' : 'Turn flash on'
                            }
                            title={
                                flashAvailable ? 'Flash' : 'Flash unavailable'
                            }
                        >
                            <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                aria-hidden="true"
                            >
                                <path d="m13 2-8 11h6l-1 9 9-12h-6l2-8Z" />
                            </svg>
                        </button>
                    </>
                )}
                <input
                    ref={inputRef}
                    type="file"
                    accept="image/*"
                    aria-label="Choose ingredient photo"
                    hidden
                    onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () => {
                            if (typeof reader.result === 'string')
                                setPreview(reader.result);
                        };
                        reader.readAsDataURL(file);
                    }}
                />
            </div>
            {preview && (
                <p className="ingredient-camera-note">
                    {mode === 'label'
                        ? 'Review the photo, then enter the nutrition values shown on the label.'
                        : 'Review the photo, then enter the ingredient details.'}
                </p>
            )}
        </dialog>,
        document.body,
    );
}
