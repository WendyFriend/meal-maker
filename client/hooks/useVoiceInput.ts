// Records a spoken utterance and returns the transcript.
//
// Ported from the standalone lookup tool, which is where the awkward parts were
// worked out:
//   * getUserMedia only exists in a secure context. http://localhost counts as
//     secure, so this works in dev; a LAN address would not.
//   * one AudioContext for the whole session, because browsers cap concurrent
//     contexts at around six and creating one per utterance eventually throws.
//   * the container is negotiated, because Safari cannot record webm at all.
//   * levels are read with an AnalyserNode and the clip ends on silence, so the
//     user does not have to tap to stop.
//
// The recording is sent to POST /api/transcribe, which returns { text }.
import { useCallback, useEffect, useRef, useState } from 'react';

/** Pause length that ends an utterance. */
const SILENCE_MS = 900;
/** Shorter than this is a cough or a click, not a word. */
const MIN_SPEECH_MS = 300;
/** Safety cap on one utterance. */
const MAX_CLIP_MS = 15000;
/** Threshold above the measured noise floor that counts as speech. */
const NOISE_MULTIPLIER = 2.2;

/** Mime types in order of preference. Safari only offers mp4. */
const MIME_CANDIDATES = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
];

export type VoiceStatus = 'idle' | 'listening' | 'hearing' | 'transcribing';

export type UseVoiceInput = {
    /** False when the browser cannot record, or the context is insecure. */
    supported: boolean;
    /** Why it is unsupported, for a hint under the button. */
    unsupportedReason: string | null;
    status: VoiceStatus;
    toggle: () => void;
    stop: () => void;
    /** Last error worth showing, or null. */
    error: string | null;
};

type Options = {
    /** Called with each finished transcript. */
    onTranscript: (text: string) => void;
};

function detectSupport(): { supported: boolean; reason: string | null } {
    if (typeof navigator === 'undefined') return { supported: false, reason: null };
    const hasApi =
        typeof navigator.mediaDevices?.getUserMedia === 'function' &&
        typeof window.MediaRecorder === 'function';
    if (!hasApi) {
        return {
            supported: false,
            reason: window.isSecureContext
                ? 'This browser cannot record audio — type instead.'
                : 'Voice needs a secure (https) connection — type instead.',
        };
    }
    return { supported: true, reason: null };
}

export function useVoiceInput({ onTranscript }: Options): UseVoiceInput {
    const [status, setStatus] = useState<VoiceStatus>('idle');
    const [error, setError] = useState<string | null>(null);
    const [support] = useState(detectSupport);

    // Refs, not state: these are touched from callbacks that must not capture a
    // stale render.
    const streamRef = useRef<MediaStream | null>(null);
    const ctxRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const recorderRef = useRef<MediaRecorder | null>(null);
    const activeRef = useRef(false);
    const capturingRef = useRef(false);
    const stoppingRef = useRef(false);
    const noiseFloorRef = useRef(0.01);
    const utteranceRef = useRef(0);
    // Kept in a ref so a changed callback does not restart the recorder. The ref
    // is written in an effect, not during render, because writing a ref during
    // render is not allowed and would not re-render correctly.
    const onTranscriptRef = useRef(onTranscript);

    useEffect(() => {
        onTranscriptRef.current = onTranscript;
    }, [onTranscript]);

    /** Sends a finished clip and surfaces the transcript. */
    const sendClip = useCallback(async (blob: Blob) => {
        if (!blob.size) return;
        setStatus('transcribing');
        try {
            const response = await fetch('/api/transcribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/octet-stream' },
                body: blob,
            });
            const data = (await response.json().catch(() => null)) as
                | { text?: string; error?: { message?: string } }
                | null;

            if (!response.ok) {
                setError(
                    data?.error?.message ?? 'Could not transcribe that — try again or type it.',
                );
                return;
            }

            const text = (data?.text ?? '').trim();
            if (!text) {
                setError('Nothing heard.');
                return;
            }
            setError(null);
            onTranscriptRef.current(text);
        } catch {
            setError('Could not reach the transcription service.');
        } finally {
            // The loop may already have restarted; do not stomp its status.
            if (!capturingRef.current) setStatus(activeRef.current ? 'listening' : 'idle');
        }
    }, []);

    /**
     * Starts one utterance and watches its level.
     *
     * When the speaker pauses, the clip is sent and the next utterance starts
     * immediately — the microphone stays on until it is stopped, so a second
     * ingredient needs no extra tap.
     *
     * Held in a ref because it calls itself: a useCallback cannot refer to its
     * own binding, and the self-reference must always be the latest version.
     */
    const beginUtteranceRef = useRef<() => void>(() => {});
    const finishCurrentRef = useRef<() => void>(() => {});

    const beginUtterance = useCallback(() => {
        const stream = streamRef.current;
        const analyser = analyserRef.current;
        if (!activeRef.current || stoppingRef.current || !stream || !analyser) return;

        const id = ++utteranceRef.current;
        const chunks: Blob[] = [];
        const mime = MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type));

        const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
        recorder.ondataavailable = (event) => {
            if (event.data.size > 0) chunks.push(event.data);
        };
        recorderRef.current = recorder;
        capturingRef.current = true;
        recorder.start();

        const buffer = new Float32Array(analyser.fftSize);
        let quietSince: number | null = null;
        let speechSeen = false;
        let speechBegan = 0;
        const began = performance.now();

        const finish = (spoke: boolean) => {
            if (!capturingRef.current) return;
            capturingRef.current = false;
            setStatus(activeRef.current ? 'listening' : 'idle');

            const stopped = new Promise<void>((resolve) => {
                recorder.addEventListener('stop', () => resolve(), { once: true });
            });
            try {
                if (recorder.state === 'recording') recorder.stop();
            } catch {
                /* already stopped */
            }

            void stopped.then(() => {
                // Restart before the network round-trip, so the next ingredient
                // can be spoken while this one is still transcribing.
                if (activeRef.current && !stoppingRef.current) beginUtteranceRef.current();
                if (spoke) void sendClip(new Blob(chunks, { type: recorder.mimeType }));
            });
        };

        const tick = () => {
            if (id !== utteranceRef.current || !capturingRef.current) return;

            analyser.getFloatTimeDomainData(buffer);
            let sum = 0;
            for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
            const level = Math.sqrt(sum / buffer.length);

            // Track the floor downwards so a steady hum becomes the baseline
            // rather than a trigger.
            if (level < noiseFloorRef.current) {
                noiseFloorRef.current = noiseFloorRef.current * 0.9 + level * 0.1;
            } else {
                noiseFloorRef.current = noiseFloorRef.current * 0.999 + level * 0.001;
            }
            const threshold = Math.max(noiseFloorRef.current * NOISE_MULTIPLIER, 0.012);

            if (level > threshold) {
                if (!speechSeen) {
                    speechSeen = true;
                    speechBegan = performance.now();
                    setStatus('hearing');
                }
                quietSince = null;
            } else if (speechSeen) {
                quietSince ??= performance.now();
                if (performance.now() - quietSince >= SILENCE_MS) {
                    finish(quietSince - speechBegan >= MIN_SPEECH_MS);
                    return;
                }
            }

            if (performance.now() - began >= MAX_CLIP_MS) {
                finish(speechSeen && performance.now() - speechBegan >= MIN_SPEECH_MS);
                return;
            }

            requestAnimationFrame(tick);
        };

        // Lets stop() keep what was said so far instead of dropping it.
        finishCurrentRef.current = () =>
            finish(speechSeen && performance.now() - speechBegan >= MIN_SPEECH_MS);

        requestAnimationFrame(tick);
    }, [sendClip]);

    // Keep the ref pointing at the current implementation.
    useEffect(() => {
        beginUtteranceRef.current = beginUtterance;
    }, [beginUtterance]);

    const stop = useCallback(() => {
        stoppingRef.current = true;
        activeRef.current = false;
        // Stopping mid-sentence still sends that sentence.
        if (capturingRef.current) finishCurrentRef.current();
        finishCurrentRef.current = () => {};
        utteranceRef.current += 1;
        capturingRef.current = false;
        try {
            if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
        } catch {
            /* already stopped */
        }
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        void ctxRef.current?.close().catch(() => {});
        ctxRef.current = null;
        analyserRef.current = null;
        setStatus('idle');
    }, []);

    const toggle = useCallback(async () => {
        if (!support.supported) return;
        if (activeRef.current) {
            stop();
            return;
        }

        setError(null);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    // Processing that helps in a kitchen.
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });
            streamRef.current = stream;

            const ctx = new AudioContext();
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 1024;
            ctx.createMediaStreamSource(stream).connect(analyser);
            ctxRef.current = ctx;
            analyserRef.current = analyser;

            noiseFloorRef.current = 0.01;
            stoppingRef.current = false;
            activeRef.current = true;
            setStatus('listening');
            beginUtterance();
        } catch (err) {
            const denied = err instanceof DOMException && err.name === 'NotAllowedError';
            setError(denied ? 'Microphone permission denied.' : 'Could not open the microphone.');
            stop();
        }
    }, [beginUtterance, stop, support.supported]);

    // Release the microphone if the component unmounts mid-session.
    useEffect(() => stop, [stop]);

    return {
        supported: support.supported,
        unsupportedReason: support.reason,
        status,
        toggle: () => void toggle(),
        stop,
        error,
    };
}
