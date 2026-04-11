My recommendation:
Keep the local-first architecture, but change the transcription strategy first: use VAD-style segmentation with speech padding and small overlap, then dedupe overlap when merging. That is the highest ROI change.
Stop treating live as “drop old audio.” Make it “show provisional captions quickly, then stabilize/finalize them” so you keep completeness.
If you want a backend upgrade, I’d prefer direct whisper.cpp integration or faster-whisper over the current nodejs-whisper file-roundtrip wrapper.
Keep Parakeet as an opt-in accelerator for users with the right Python/CUDA setup, not the default main path.