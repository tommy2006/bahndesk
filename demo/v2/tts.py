"""Narrate each scene with an expressive neural voice and keep word timings for subtitles."""
import asyncio, json, sys
from pathlib import Path
import edge_tts

DIR = Path(__file__).resolve().parent
VOICE, RATE, PITCH = "en-US-AvaMultilingualNeural", "+8%", "+2Hz"


async def narrate(scene):
    words = []
    com = edge_tts.Communicate(scene["text"], VOICE, rate=RATE, pitch=PITCH, boundary="WordBoundary")
    with open(DIR / f"{scene['id']}.mp3", "wb") as f:
        async for chunk in com.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                # offsets are in 100-ns ticks
                words.append({"w": chunk["text"], "start": chunk["offset"] / 1e7, "end": (chunk["offset"] + chunk["duration"]) / 1e7})
    (DIR / f"{scene['id']}.words.json").write_text(json.dumps(words), encoding="utf-8")
    print(scene["id"], len(words), "words")


async def main():
    for s in json.loads((DIR / "scenes.json").read_text(encoding="utf-8")):
        await narrate(s)

asyncio.run(main())
