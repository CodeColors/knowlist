import { useEffect } from 'react';
import { Link, useParams } from 'react-router';
import { useApi, useDocumentTitle } from '../lib/hooks';
import { langLabel } from '../lib/tts';
import type { SetDetail } from '../lib/types';
import { Icon } from '../components/Icon';
import { Spinner } from '../components/ui';

/** Version imprimable (et exportable en PDF via la boîte d'impression du navigateur). */
export default function PrintSet() {
  const { id } = useParams();
  const { data } = useApi<SetDetail>(`/sets/${id}`);
  useDocumentTitle(data ? `${data.set.title} (impression)` : 'Impression');
  useEffect(() => {
    if (data) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [data]);
  if (!data) return <Spinner />;
  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-4 flex flex-wrap gap-2">
        <Link to={`/sets/${id}`} className="btn-secondary">
          ← Retour
        </Link>
        <button type="button" className="btn-primary" onClick={() => window.print()}>
          <Icon name="print" size={20} /> Imprimer / Enregistrer en PDF
        </button>
      </div>
      <h1 className="text-3xl font-semibold">{data.set.title}</h1>
      <p className="mb-4 text-ink-soft">
        {data.cards.length} cartes · {langLabel(data.set.termLang)} → {langLabel(data.set.defLang)}
      </p>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b-2 border-ink">
            <th className="w-10 py-2 pr-2">#</th>
            <th className="py-2 pr-4">Terme</th>
            <th className="py-2">Définition</th>
          </tr>
        </thead>
        <tbody>
          {data.cards.map((c, i) => (
            <tr key={c.id} className="break-inside-avoid border-b border-line align-top">
              <td className="py-2 pr-2 text-ink-soft">{i + 1}</td>
              <td className="py-2 pr-4 font-semibold">{c.term}</td>
              <td className="py-2 whitespace-pre-line">
                {c.definition}
                {c.example && <span className="block text-sm text-ink-soft italic">« {c.example} »</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
