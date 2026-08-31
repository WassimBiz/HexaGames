import { useEffect, useRef, type PointerEvent } from 'react';
import type { DrawSegment, Point } from '@hexaguess/shared';
import styles from '../App.module.css';
import { floodFillPixels, hexToRgb } from '../floodFill';
import { createUuid } from '../randomId';

interface DrawingCanvasProps {
  strokes: DrawSegment[];
  canDraw: boolean;
  color: string;
  size: number;
  tool: 'brush' | 'eraser' | 'fill';
  onSegment: (segment: DrawSegment) => void;
}

function paintStroke(
  context: CanvasRenderingContext2D,
  stroke: DrawSegment,
  preceding: DrawSegment | undefined,
  width: number,
  height: number,
  ratio: number,
): void {
  if (stroke.tool === 'fill') {
    const image = context.getImageData(0, 0, width, height);
    const changed = floodFillPixels(
      image.data,
      width,
      height,
      stroke.from.x * (width - 1),
      stroke.from.y * (height - 1),
      hexToRgb(stroke.color),
    );
    if (changed) context.putImageData(image, 0, 0);
    return;
  }

  const drawLine = (from: Point, to: Point) => {
    context.beginPath();
    context.strokeStyle = stroke.tool === 'eraser' ? '#F7F0DD' : stroke.color;
    context.lineWidth = stroke.size * ratio;
    context.moveTo(from.x * width, from.y * height);
    context.lineTo(to.x * width, to.y * height);
    context.stroke();
  };
  if (
    preceding?.strokeId === stroke.strokeId &&
    (preceding.to.x !== stroke.from.x || preceding.to.y !== stroke.from.y)
  ) {
    drawLine(preceding.to, stroke.from);
  }
  drawLine(stroke.from, stroke.to);
}

function render(canvas: HTMLCanvasElement, strokes: DrawSegment[]): void {
  const context = canvas.getContext('2d');
  if (!context) return;
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width * ratio));
  const height = Math.max(1, Math.round(rect.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  context.fillStyle = '#F7F0DD';
  context.fillRect(0, 0, width, height);
  context.lineCap = 'round';
  context.lineJoin = 'round';
  strokes.forEach((stroke, index) => {
    paintStroke(context, stroke, strokes[index - 1], width, height, ratio);
  });
}

export function DrawingCanvas({
  strokes,
  canDraw,
  color,
  size,
  tool,
  onSegment,
}: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previous = useRef<Point | null>(null);
  const pending = useRef<Point | null>(null);
  const strokeId = useRef<string | null>(null);
  const drawing = useRef(false);
  const renderedStrokes = useRef<DrawSegment[]>([]);
  const flushTimer = useRef<number | null>(null);
  const lastEmission = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const redraw = () => {
      render(canvas, strokes);
      renderedStrokes.current = strokes;
    };
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const expectedWidth = Math.max(1, Math.round(rect.width * ratio));
    const expectedHeight = Math.max(1, Math.round(rect.height * ratio));
    const previous = renderedStrokes.current;
    const isAppend =
      canvas.width === expectedWidth &&
      canvas.height === expectedHeight &&
      previous.length <= strokes.length &&
      previous.every((stroke, index) => stroke.id === strokes[index]?.id);
    const context = canvas.getContext('2d');
    if (isAppend && context) {
      context.lineCap = 'round';
      context.lineJoin = 'round';
      for (let index = previous.length; index < strokes.length; index += 1) {
        paintStroke(
          context,
          strokes[index]!,
          strokes[index - 1],
          expectedWidth,
          expectedHeight,
          ratio,
        );
      }
      renderedStrokes.current = strokes;
    } else {
      redraw();
    }
    const observer = new ResizeObserver(redraw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [strokes]);

  const pointFromEvent = (event: PointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
  };

  const start = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!canDraw) return;
    if (tool === 'fill') {
      const id = createUuid();
      const point = pointFromEvent(event);
      onSegment({ id, strokeId: id, from: point, to: point, color, size, tool });
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    previous.current = pointFromEvent(event);
    pending.current = null;
    strokeId.current = createUuid();
    drawing.current = true;
    lastEmission.current = performance.now();
  };

  const flushPending = () => {
    flushTimer.current = null;
    if (!previous.current || !pending.current || !strokeId.current) return;
    const next = pending.current;
    pending.current = null;
    if (next.x === previous.current.x && next.y === previous.current.y) return;
    onSegment({
      id: createUuid(),
      strokeId: strokeId.current,
      from: previous.current,
      to: next,
      color,
      size,
      tool,
    });
    previous.current = next;
    lastEmission.current = performance.now();
  };

  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!canDraw || !drawing.current || !previous.current) return;
    pending.current = pointFromEvent(event);
    if (flushTimer.current !== null) return;
    const remainingDelay = Math.max(0, 20 - (performance.now() - lastEmission.current));
    flushTimer.current = window.setTimeout(flushPending, remainingDelay);
  };

  const stop = () => {
    if (flushTimer.current !== null) window.clearTimeout(flushTimer.current);
    flushPending();
    previous.current = null;
    pending.current = null;
    strokeId.current = null;
    drawing.current = false;
  };

  return (
    <canvas
      ref={canvasRef}
      className={`${styles.canvas} ${canDraw ? styles.drawable : ''}`}
      data-testid="draw-canvas"
      aria-label={canDraw ? 'Toile de dessin interactive' : 'Dessin du joueur en cours'}
      tabIndex={0}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
    />
  );
}
