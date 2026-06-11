import asyncio
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from graph import build_graph

app = FastAPI(title="AquaAlert Pipeline", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

pipeline = build_graph()

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/run")
async def run_pipeline(background_tasks: BackgroundTasks):
    """Trigger the full LangGraph pipeline in background."""
    background_tasks.add_task(_run)
    return {"status": "Pipeline started", "message": "Check /api/alerts on backend for results"}

@app.post("/run/sync")
async def run_pipeline_sync():
    """Run pipeline synchronously — useful for demo/testing."""
    result = await pipeline.ainvoke({})
    return {
        "status":     "completed",
        "dispatched": result.get("dispatched", []),
        "failed":     result.get("failed", []),
        "flagged":    len(result.get("flagged_data", [])),
    }

async def _run():
    try:
        result = await pipeline.ainvoke({})
        print(f"[PIPELINE] Done. Dispatched: {result.get('dispatched')} | Failed: {result.get('failed')}")
    except Exception as e:
        print(f"[PIPELINE] Error: {e}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)