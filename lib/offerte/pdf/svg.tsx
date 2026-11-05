import { Circle, Line, Rect } from "@react-pdf/renderer";

/** Tekent de losse onderdelen (rect, line, circle) van een kozijntekening als vectoren in een PDF. */
export function svgOnderdelen(binnenwerk: string) {
  const onderdelen: React.ReactElement[] = [];
  const attr = (tekst: string) => {
    const a: Record<string, string> = {};
    for (const m of tekst.matchAll(/([\w-]+)="([^"]*)"/g)) a[m[1]] = m[2];
    return a;
  };
  const getal = (v: string | undefined) => (v === undefined ? undefined : Number(v));
  let i = 0;
  for (const m of binnenwerk.matchAll(/<(rect|line|circle)\s([^>]*?)\/>/g)) {
    const a = attr(m[2]);
    const sleutel = `${m[1]}-${i++}`;
    if (m[1] === "rect") {
      onderdelen.push(<Rect key={sleutel} x={getal(a.x) ?? 0} y={getal(a.y) ?? 0} width={getal(a.width) ?? 0} height={getal(a.height) ?? 0} rx={getal(a.rx)} fill={a.fill} fillOpacity={getal(a["fill-opacity"])} stroke={a.stroke} strokeWidth={getal(a["stroke-width"])} />);
    } else if (m[1] === "line") {
      onderdelen.push(<Line key={sleutel} x1={getal(a.x1) ?? 0} y1={getal(a.y1) ?? 0} x2={getal(a.x2) ?? 0} y2={getal(a.y2) ?? 0} stroke={a.stroke} strokeWidth={getal(a["stroke-width"])} opacity={getal(a.opacity)} />);
    } else {
      onderdelen.push(<Circle key={sleutel} cx={getal(a.cx) ?? 0} cy={getal(a.cy) ?? 0} r={getal(a.r) ?? 1} fill={a.fill} />);
    }
  }
  return onderdelen;
}
