# Computer Vision: Noise, Filtering & Edge Detection Analysis

**Assignment 1 - Computer Vision Class**
**Kelompok 5**

- 2361020 – VENILIA DINA MINARTI
- 2361021 – VINCENTIUS BRYAN KWANDOU
- 2361022 – VINCENTLEE EDBERT MARKIONES
- 2361023 – RENDY ALFIN MAMINTADA
- 2361024 – FELISITAS NATASYA LADY CLAUDIA

## Project Overview
This project demonstrates the impact of noise on image features and how different filtering techniques (Gaussian vs Median) affect the quality of edge detection (Sobel).

## Technical Pipeline
1. **Original Image**: Input baseline.
2. **Noise Generation**: Gaussian & Salt-Pepper (10-30%).
3. **Filtering**:
   - **Gaussian Filter**: Linear smoothing, effective for normal noise.
   - **Median Filter**: Non-linear, superior for impulse noise.
4. **Edge Detection**: Sobel operator applied to filtered outputs.

## Live Demo
[https://cv-app-livid.vercel.app/](https://cv-app-livid.vercel.app/)

## Deployment
Deployed on Vercel using Next.js 16 and Canvas API.
