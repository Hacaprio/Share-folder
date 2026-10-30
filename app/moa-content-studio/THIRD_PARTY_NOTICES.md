# Third-party components

Moa's application source is newly authored. It uses separately licensed libraries and model assets. Installation downloads dependencies into the private virtual environment / node_modules; those environments are not included in the source ZIP.

- U²-NetP model: https://github.com/xuebinqin/U-2-Net ; model distribution: https://github.com/danielgatis/rembg/releases/tag/v0.0.0 . Upstream U²-Net license is included in `licenses/U2Net-APACHE-2.0.txt`. Image normalization follows the model's documented preprocessing. Model identity is in `models/manifest.json`.
- Tesseract.js 6.0.1 and Tesseract.js-core: https://github.com/naptha/tesseract.js . See the installed package licenses. Tesseract engine license is included in `licenses/Tesseract-APACHE-2.0.txt`.
- English / Korean Tesseract trained data: https://tessdata.projectnaptha.com/4.0.0_fast/ ; upstream https://github.com/tesseract-ocr/tessdata_fast . Assets and hashes are listed in the model manifest.
- Nanum Gothic, NAVER Corporation: https://fonts.google.com/specimen/Nanum+Gothic ; SIL Open Font License text included in `licenses/NanumGothic-OFL.txt`.
- OpenCV: https://opencv.org/ ; ONNX Runtime: https://onnxruntime.ai/ . See installed distribution license files.
- Pillow, NumPy, qrcode, pypdf, pdfplumber, ReportLab, python-docx, openpyxl, python-pptx, PDFium bindings: see the version-pinned installed packages for license and attribution files.
- imageio-ffmpeg: https://github.com/imageio/imageio-ffmpeg . Its separately installed FFmpeg binary reports GNU GPL v2 or later for the build used during validation. The binary is not redistributed in Moa's source ZIP. Source/build information is supplied by the imageio-ffmpeg / FFmpeg projects.
- Optional Poppler: https://poppler.freedesktop.org/ . Uses an existing installation when available; otherwise the app uses separately installed PDFium bindings.
- Marketplace reference data: official fee/policy links are shown in the app. The reference category table was observed from https://tools.kdpmkt.com/ on 2026-10-31. Application code from that site is not included in Moa's runtime.
