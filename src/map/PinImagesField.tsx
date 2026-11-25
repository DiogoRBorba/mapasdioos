import { useCampaignId, campaignApi } from '../CampaignContext';
import { useEffect, useRef, useState } from 'react';
import { ImagePlus, LoaderCircle, X } from 'lucide-react';
import { MAX_PIN_IMAGES, MAX_IMAGE_BYTES, MAX_SOURCE_BYTES, pinImageUrl } from '../../shared/pin-images.js';
import type { PinImage } from './types';

async function prepare(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Use imagens JPG, PNG ou WebP.');
  if (file.size > MAX_SOURCE_BYTES) throw new Error('Cada arquivo pode ter até 20 MB.');
  let blob: Blob = file;
  if (file.size > MAX_IMAGE_BYTES) {
    const bitmap = await createImageBitmap(file);
    try {
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Não foi possível preparar a imagem.')), 'image/webp', .86));
    } finally { bitmap.close(); }
  }
  if (blob.size > MAX_IMAGE_BYTES) throw new Error('Esta imagem é muito grande. Tente uma versão menor.');
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.')); reader.readAsDataURL(blob);
  });
}

export default function PinImagesField({ images, onChange, onBusy }: { images: PinImage[]; onChange: (images: PinImage[]) => void; onBusy: (busy: boolean) => void }) {
  const campaignId = useCampaignId();
  const fileInput = useRef<HTMLInputElement>(null);
  const pending = useRef<AbortController | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  useEffect(() => () => { pending.current?.abort(); }, []);
  async function upload(files: File[]) {
    if (!files.length || pending.current) return;
    if (images.length + files.length > MAX_PIN_IMAGES) { setError(`Você pode anexar até ${MAX_PIN_IMAGES} imagens por pin.`); return; }
    const controller = new AbortController(); pending.current = controller;
    setUploading(true); onBusy(true); setError('');
    const next = [...images];
    try {
      for (let index = 0; index < files.length; index++) {
        setProgress(`Enviando imagem ${index + 1} de ${files.length}…`);
        const file = files[index]; const data = await prepare(file);
        if (controller.signal.aborted) return;
        const response = await fetch(campaignApi('/api/pin-images',campaignId), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: file.name.slice(0, 240), data }), signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Não foi possível enviar a imagem.');
        next.push(result.image); onChange([...next]);
      }
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error && !(err instanceof TypeError) ? err.message : 'O envio foi interrompido. Tente novamente.');
    } finally {
      pending.current = null;
      if (!controller.signal.aborted) { setUploading(false); onBusy(false); setProgress(''); }
    }
  }
  return <div className="pin-images-field">
    <div className="pin-images-label"><span>Imagens <small>opcional</small></span><span>{images.length}/{MAX_PIN_IMAGES}</span></div>
    {images.length > 0 && <ul className="pin-image-previews">{images.map((image, index) => <li key={image.id}><img src={campaignApi(pinImageUrl(image.id),campaignId)} alt={`Prévia: ${image.name}`} loading="lazy"/><button type="button" aria-label={`Remover imagem ${index + 1}: ${image.name}`} title="Remover imagem do pin" disabled={uploading} onClick={() => onChange(images.filter(item => item.id !== image.id))}><X size={15}/></button><span title={image.name}>{image.name}</span></li>)}</ul>}
    <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ''; void upload(files); }}/>
    <button className="pin-upload-button" type="button" disabled={uploading || images.length >= MAX_PIN_IMAGES} onClick={() => fileInput.current?.click()}>{uploading ? <LoaderCircle size={17} className="spin"/> : <ImagePlus size={17}/>} {uploading ? progress : 'Anexar imagens'}</button>
    <p className="pin-upload-hint">JPG, PNG ou WebP · até 20 MB por arquivo. As imagens serão otimizadas e publicadas ao salvar o pin.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <span className="sr-only" role="status">{progress}</span>
  </div>;
}
