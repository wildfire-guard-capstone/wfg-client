import { createContext, useContext, useState } from 'react';
import type { PropsWithChildren } from 'react';
import type { InitialPerimeter } from '../../api';

type Coordinate = [number, number];
function useDrawingState() {
  const [point, setPoint] = useState<Coordinate | null>(null);
  const [tool, setTool] = useState<'none' | 'point' | 'polygon'>('none');
  const [vertices, setVertices] = useState<Coordinate[]>([]);
  const [geometry, setGeometry] = useState<InitialPerimeter['geometry'] | null>(
    null,
  );
  return {
    point,
    setPoint,
    tool,
    setTool,
    vertices,
    setVertices,
    geometry,
    setGeometry,
    click(coordinate: Coordinate) {
      if (tool === 'point') {
        setPoint(coordinate);
        setTool('none');
      } else if (tool === 'polygon') setVertices((v) => [...v, coordinate]);
    },
    reset(coordinate: Coordinate | null = null) {
      setPoint(coordinate);
      setTool('none');
      setVertices([]);
      setGeometry(null);
    },
    finish() {
      if (vertices.length < 3) return;
      setGeometry({
        type: 'Polygon',
        coordinates: [[...vertices, vertices[0]]],
      });
      setTool('none');
    },
  };
}
const DrawingContext = createContext<ReturnType<typeof useDrawingState> | null>(
  null,
);
export function DrawingProvider({ children }: PropsWithChildren) {
  const value = useDrawingState();
  return (
    <DrawingContext.Provider value={value}>{children}</DrawingContext.Provider>
  );
}
export function useDrawing() {
  const value = useContext(DrawingContext);
  if (!value) throw new Error('DrawingProvider required');
  return value;
}
