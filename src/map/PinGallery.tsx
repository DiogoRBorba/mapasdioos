import { useCampaignId, campaignApi } from '../CampaignContext';
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { pinImageUrl } from '../../shared/pin-images.js';
import type { PinImage } from './types';

export default function PinGallery({ images, title }: { images: PinImage[]; title: string }) {
  const campaignId = useCampaignId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState<number | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const image = index === null ? null : images[index];
  useEffect(() => {
    if (image) { if (!dialog.current?.open) dialog.current?.showModal(); }
    else if (dialog.current?.open) dialog.current.close();
  }, [image]);
  if (!images.length) return null;
  const move = (offset: number) => setIndex(current => ((current || 0) + offset + images.length) % images.length);
  return <div className="pin-gallery">
    <p className="eyebrow">IMAGENS <span>{images.length}</span></p>
    <div className="pin-gallery-grid">{images.map((item, position) => <button key={item.id} type="button" aria-label={`Ampliar imagem ${position + 1} de ${title}`} onClick={() => setIndex(position)}>{failed.includes(item.id) ? <span>Imagem indisponível</span> : <img src={campaignApi(pinImageUrl(item.id),campaignId)} alt={item.name} loading="lazy" onError={() => setFailed(current => [...current, item.id])}/>}</button>)}</div>
    <dialog ref={dialog} className="pin-lightbox" aria-label={`Imagens de ${title}`} onClose={() => setIndex(null)} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }} onKeyDown={event => { if (event.key === 'ArrowRight') { event.preventDefault(); move(1); } if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); } }}>
      {image && <div className="pin-lightbox-content"><header><div><strong>{title}</strong><span>Imagem {(index || 0) + 1} de {images.length}</span></div><button type="button" className="icon-button" aria-label="Fechar imagem ampliada" onClick={() => dialog.current?.close()}><X size={23}/></button></header><div className="pin-lightbox-stage">{images.length > 1 && <button type="button" className="gallery-prev" aria-label="Imagem anterior" onClick={() => move(-1)}><ChevronLeft size={25}/></button>}{failed.includes(image.id) ? <p>Não foi possível carregar esta imagem.</p> : <img key={image.id} src={campaignApi(pinImageUrl(image.id),campaignId)} alt={image.name} onError={() => setFailed(current => [...current, image.id])}/>} {images.length > 1 && <button type="button" className="gallery-next" aria-label="Próxima imagem" onClick={() => move(1)}><ChevronRight size={25}/></button>}</div><p>{image.name}</p></div>}
    </dialog>
  </div>;
}
