import { useState, useEffect, useRef } from "react";
import "./App.css";

type ViewMode = "grid" | "manhwa";

interface ImageData {
  url: string;
  index: number;
}

function App() {
  const [url, setUrl] = useState("");
  const [images, setImages] = useState<ImageData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Persisted configuration
  const [viewMode, setViewMode] = useState<ViewMode>(
    () => (localStorage.getItem("viewMode") as ViewMode) || "grid",
  );
  const [manhwaWidth, setManhwaWidth] = useState(
    () => Number(localStorage.getItem("manhwaWidth")) || 800,
  );
  const [useProxyForImages, setUseProxyForImages] = useState(
    () => localStorage.getItem("useProxy") !== "false",
  );

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [isFetchingSequence, setIsFetchingSequence] = useState(false);
  const stopFetchingRef = useRef(false);

  // Sync config to localStorage
  useEffect(() => {
    localStorage.setItem("viewMode", viewMode);
  }, [viewMode]);
  useEffect(() => {
    localStorage.setItem("manhwaWidth", manhwaWidth.toString());
  }, [manhwaWidth]);
  useEffect(() => {
    localStorage.setItem("useProxy", useProxyForImages.toString());
  }, [useProxyForImages]);

  // Interaction state
  const [pinchDist, setPinchDist] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [lastTouch, setLastTouch] = useState({ x: 0, y: 0 });

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const d = Math.hypot(
        e.touches[0].pageX - e.touches[1].pageX,
        e.touches[0].pageY - e.touches[1].pageY,
      );
      setPinchDist(d);
    } else if (e.touches.length === 1 && zoom > 1) {
      setIsDragging(true);
      setLastTouch({ x: e.touches[0].pageX, y: e.touches[0].pageY });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchDist > 0) {
      const d = Math.hypot(
        e.touches[0].pageX - e.touches[1].pageX,
        e.touches[0].pageY - e.touches[1].pageY,
      );
      setZoom((z) => Math.min(Math.max(0.5, z * (d / pinchDist)), 5));
      setPinchDist(d);
    } else if (e.touches.length === 1 && isDragging) {
      const dx = e.touches[0].pageX - lastTouch.x;
      const dy = e.touches[0].pageY - lastTouch.y;
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
      setLastTouch({ x: e.touches[0].pageX, y: e.touches[0].pageY });
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    setPinchDist(0);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom > 1) {
      setIsDragging(true);
      setLastTouch({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      const dx = e.clientX - lastTouch.x;
      const dy = e.clientY - lastTouch.y;
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
      setLastTouch({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleNext = () => {
    if (selectedIndex !== null && selectedIndex < images.length - 1) {
      setSelectedIndex(selectedIndex + 1);
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }
  };
  const handlePrev = () => {
    if (selectedIndex !== null && selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1);
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }
  };

  const PROXIES = [
    (url: string) =>
      `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  ];

  const getProxiedImageUrl = (originalUrl: string) => {
    if (!useProxyForImages) return originalUrl;
    return `https://images.weserv.nl/?url=${encodeURIComponent(originalUrl.replace(/^https?:\/\//, ""))}`;
  };

  const extractImages = async (targetUrl: string, proxyIndex = 0) => {
    setLoading(true);
    setError(null);
    try {
      const proxyUrl = PROXIES[proxyIndex](targetUrl);
      const response = await fetch(proxyUrl);
      if (!response.ok) {
        if (proxyIndex < PROXIES.length - 1)
          return extractImages(targetUrl, proxyIndex + 1);
        throw new Error(`Proxy failed`);
      }
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const foundUrls = new Set<string>();
      doc
        .querySelectorAll(
          "img, source, [data-src], [data-lazy-src], [data-main-image]",
        )
        .forEach((el) => {
          let src =
            el.getAttribute("src") ||
            el.getAttribute("data-src") ||
            el.getAttribute("data-lazy-src") ||
            el.getAttribute("data-main-image") ||
            el.getAttribute("srcset");
          if (src) {
            if (src.includes(",")) src = src.split(",")[0].split(" ")[0];
            try {
              const abs = new URL(src, targetUrl).href;
              if (
                abs.match(/\.(jpg|jpeg|png|webp|gif|avif)/i) ||
                abs.includes("image")
              )
                foundUrls.add(abs);
            } catch (e) {
              console.log(e);
            }
          }
        });
      if (foundUrls.size === 0) {
        doc.querySelectorAll("script").forEach((s) => {
          const m = (s.textContent || "").match(
            /https?:\/\/[^"']+\.(jpg|jpeg|png|webp)/gi,
          );
          if (m) m.forEach((url) => foundUrls.add(url));
        });
      }
      if (foundUrls.size === 0) setError("No images found.");
      else
        setImages(Array.from(foundUrls).map((u, i) => ({ url: u, index: i })));
    } catch {
      if (proxyIndex < PROXIES.length - 1)
        return extractImages(targetUrl, proxyIndex + 1);
      setError("Failed to fetch webpage.");
    } finally {
      setLoading(false);
    }
  };

  const loadSequence = async (targetUrl: string) => {
    setError(null);
    setImages([]);
    setIsFetchingSequence(true);
    stopFetchingRef.current = false;
    const match = targetUrl.match(/^(.*?)(\d+)(\.[^.]+)$/);
    if (!match) {
      if (targetUrl.match(/\.(jpg|jpeg|png|webp|gif|avif)/i))
        setImages([{ url: targetUrl, index: 0 }]);
      else setError("Not an image link.");
      setIsFetchingSequence(false);
      return;
    }
    const [_, prefix, numStr, suffix] = match;
    let currentNum = parseInt(numStr);
    let total = 0;
    while (!stopFetchingRef.current) {
      const batch = [];
      for (let i = 0; i < 5; i++) {
        const n = (currentNum + i).toString().padStart(numStr.length, "0");
        batch.push(`${prefix}${n}${suffix}`);
      }
      const res = await Promise.all(
        batch.map(async (u) => {
          try {
            const r = await fetch(getProxiedImageUrl(u), { method: "HEAD" });
            return r.ok ? u : null;
          } catch {
            return null;
          }
        }),
      );
      const valid = res.filter((u): u is string => u !== null);
      if (valid.length === 0) break;
      setImages((p) => [
        ...p,
        ...valid.map((u, i) => ({ url: u, index: total + i })),
      ]);
      total += valid.length;
      currentNum += 5;
      if (valid.length < 5) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    setIsFetchingSequence(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    if (url.match(/\.(jpg|jpeg|png|webp|gif|avif)(\?.*)?$/i)) {
      if (url.match(/\d+\.[^.]+$/)) loadSequence(url);
      else setImages([{ url, index: 0 }]);
    } else extractImages(url);
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (selectedIndex === null) return;
      if (e.key === "ArrowRight") handleNext();
      if (e.key === "ArrowLeft") handlePrev();
      if (e.key === "Escape") setSelectedIndex(null);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [selectedIndex, images]);

  return (
    <div className="app-container">
      <header>
        <h1>Otaku Reader</h1>
      </header>
      <div className="controls">
        <form onSubmit={handleSubmit} className="input-row">
          <input
            type="text"
            placeholder="URL..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button type="submit" disabled={isFetchingSequence}>
            Load
          </button>
          {isFetchingSequence ? (
            <button
              type="button"
              onClick={() => (stopFetchingRef.current = true)}
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setUrl("");
                setImages([]);
                setError(null);
              }}
            >
              Clear
            </button>
          )}
        </form>
        <div className="options-row">
          <div className="option-group">
            <button
              className={viewMode === "grid" ? "" : "secondary"}
              onClick={() => setViewMode("grid")}
            >
              Grid
            </button>
            <button
              className={viewMode === "manhwa" ? "" : "secondary"}
              onClick={() => setViewMode("manhwa")}
            >
              Manhwa
            </button>
          </div>
          {viewMode === "manhwa" && (
            <div className="option-group">
              <input
                type="range"
                min="300"
                max="1200"
                step="50"
                value={manhwaWidth}
                onChange={(e) => setManhwaWidth(Number(e.target.value))}
              />
              <span>{manhwaWidth}px</span>
            </div>
          )}
          <div className="option-group">
            <label>
              <input
                type="checkbox"
                checked={useProxyForImages}
                onChange={(e) => setUseProxyForImages(e.target.checked)}
              />{" "}
              Proxy
            </label>
          </div>
        </div>
      </div>

      {loading || isFetchingSequence ? <div className="loader"></div> : null}
      {error && <div className="error-msg">{error}</div>}

      <main>
        {viewMode === "grid" ? (
          <div className="gallery-grid">
            {images.map((img) => (
              <div
                key={img.url}
                className="grid-item"
                onClick={() => {
                  setSelectedIndex(img.index);
                  setZoom(1);
                }}
              >
                <img src={getProxiedImageUrl(img.url)} alt="" loading="lazy" />
              </div>
            ))}
          </div>
        ) : (
          <div
            className="gallery-manhwa"
            style={{ maxWidth: `${manhwaWidth}px` }}
          >
            {images.map((img) => (
              <div key={img.url} className="manhwa-item">
                <img src={getProxiedImageUrl(img.url)} alt="" loading="lazy" />
              </div>
            ))}
          </div>
        )}
      </main>

      {selectedIndex !== null && (
        <div
          className="lightbox"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedIndex(null);
          }}
        >
          <div className="lightbox-content">
            <div
              className="lightbox-img-container"
              style={{
                transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
              }}
            >
              <img src={getProxiedImageUrl(images[selectedIndex].url)} alt="" />
            </div>

            {/* Nav Zones - Split Screen Click */}
            <div className="nav-zones">
              <div
                className="nav-zone nav-zone-prev"
                onClick={(e) => {
                  e.stopPropagation();
                  handlePrev();
                }}
              ></div>
              <div
                className="nav-zone nav-zone-next"
                onClick={(e) => {
                  e.stopPropagation();
                  handleNext();
                }}
              ></div>
            </div>
          </div>

          <button
            className="lightbox-close"
            onClick={() => setSelectedIndex(null)}
          >
            &times;
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
