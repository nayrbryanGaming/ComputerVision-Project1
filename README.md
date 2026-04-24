# Computer Vision Project 1: Noise, Filtering & Edge Detection

Advanced Image Processing Dashboard built with **Next.js 16** and **Pure Python (FastAPI)**.

## 🚀 Key Features

- **Premium UI/UX**: Built with a high-end "Cyber-CV" aesthetic, glassmorphism, and responsive stage-based grid.
- **Pure Python Logic**: Unlike standard CV apps, this project implements Gaussian Filter, Median Filter, and Sobel Edge Detection **manually** using NumPy to demonstrate deep understanding of convolution kernels.
- **Real-time Pipeline**: Upload any image and watch the multi-stage transformation in real-time.
- **Mobile Optimized**: Fully responsive design for presentation on any device.

## 🛠️ Architecture

- **Frontend**: Next.js 16 (App Router), Tailwind CSS v4.
- **Backend**: Python 3.11+, FastAPI (Vercel Serverless Functions).
- **Core Logic**: Manual NumPy implementation for academic integrity.

## 🧠 CV Algorithms Implemented

1. **Gaussian Noise**: Additive white noise using normal distribution.
2. **Salt & Pepper**: Impulsive noise via random pixel substitution.
3. **Gaussian Filter**: Manual 2D Convolution with dynamic **Sigma** control (range 0.5 - 5.0).
4. **Median Filter**: Non-linear sliding window with dynamic **Kernel Size** (3x3 to 11x11).
5. **Sobel Edge Detection**: Gradient-based edge discovery via X/Y convolution kernels. Optimized for high-contrast scenes like the provided "Night City" samples.

## 👨‍💻 Team - Kelompok 5
- 2361020 – VENILIA DINA MINARTI
- 2361021 – VINCENTIUS BRYAN KWANDOU
- 2361022 – VINCENTLEE EDBERT MARKIONES
- 2361023 – RENDY ALFIN MAMINTADA
- 2361024 – FELISITAS NATASYA LADY CLAUDIA

---
*Deployed on Vercel*
