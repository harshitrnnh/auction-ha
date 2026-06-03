import { bloomFor } from '../../data/lotsData';

export default function ArtBloom({ lot }) {
  return (
    <div className="lots-art-bloom" style={{ '--bloom': bloomFor(lot) }}>
      <div className="grain" />
      <div className="sheen" />
    </div>
  );
}
