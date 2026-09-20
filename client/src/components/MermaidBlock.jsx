import React, { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: false,
  theme: "neutral",
  securityLevel: "loose",
  fontFamily: "monospace",
});

export default function MermaidBlock({ chart }) {
  const containerRef = useRef(null);
  const [svg, setSvg] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const renderChart = async () => {
      if (!chart.trim()) return;
      const uniqueId = "mermaid-" + Math.random().toString(36).substring(2, 9);
      try {
        const { svg: renderedSvg } = await mermaid.render(uniqueId, chart);
        if (isMounted) {
          setSvg(renderedSvg);
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          setError("Diagram rendering notice");
          setSvg("");
        }
      }
    };
    renderChart();
    return () => {
      isMounted = false;
    };
  }, [chart]);

  if (error) {
    return (
      <pre className="p-3 bg-gray-100 rounded text-xs text-gray-700 font-mono overflow-x-auto">
        {chart}
      </pre>
    );
  }

  return (
    <div
      ref={containerRef}
      className="my-3 p-3 bg-white border border-gray-200 rounded-lg overflow-x-auto shadow-xs flex justify-center"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
