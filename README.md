# Demand Velocity & Inventory Intelligence

A web dashboard that forecasts 28-day demand for 8 retail products (Walmart M5 data) using a
pre-trained LightGBM model, with a FastAPI backend and a React + TypeScript dashboard frontend.

> **This is a stub README.** The full quickstart, screenshots, and run instructions are added in
> **MT-46**. For now, see the documentation set in [`docs/`](docs/) — start with
> [`docs/00_INDEX.md`](docs/00_INDEX.md).

## Status
Project scaffold created (MT-00). Backend and frontend are built across micro-tasks MT-01…MT-46
(see [`docs/micro-tasks/MT-INDEX.md`](docs/micro-tasks/MT-INDEX.md)).

## Stack
- **Backend:** Python 3.11 · FastAPI · Uvicorn · LightGBM
- **Frontend:** React 18 · TypeScript · Vite · TailwindCSS
- **Packaging:** local-dev (primary) · Docker Compose (optional, MT-45)