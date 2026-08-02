// Client-side audio (WAV→MP3) + transcript download helpers.
import { Mp3Encoder } from '@breezystack/lamejs';
import JSZip from 'jszip';
import { api, fetchRecordingBlob } from './api';

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function floatTo16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/** Decode a WAV/audio blob and re-encode it as a mono MP3 blob. */
export async function toMp3(blob: Blob): Promise<Blob> {
  const arrayBuf = await blob.arrayBuffer();
  const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
  const ctx = new AC();
  const audio = await ctx.decodeAudioData(arrayBuf.slice(0));
  const ch = audio.numberOfChannels;
  const len = audio.length;
  const mono = new Float32Array(len);
  for (let c = 0; c < ch; c++) {
    const data = audio.getChannelData(c);
    for (let i = 0; i < len; i++) mono[i] += data[i] / ch;
  }
  ctx.close();

  const sampleRate = audio.sampleRate;
  const enc = new Mp3Encoder(1, sampleRate, 128);
  const samples = floatTo16(mono);
  const blockSize = 1152;
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < samples.length; i += blockSize) {
    const buf = enc.encodeBuffer(samples.subarray(i, i + blockSize));
    if (buf.length) chunks.push(new Uint8Array(buf));
  }
  const end = enc.flush();
  if (end.length) chunks.push(new Uint8Array(end));
  return new Blob(chunks as BlobPart[], { type: 'audio/mpeg' });
}

function fileStamp(c: any): string {
  const when = c.start_timestamp ? new Date(c.start_timestamp).toISOString().slice(0, 16).replace(/[:T]/g, '-') : 'call';
  const who = (c.direction === 'inbound' ? c.from_number : c.to_number) || c.call_id;
  return `${when}_${String(who).replace(/[^\d+]/g, '')}_${c.call_id.slice(-6)}`;
}

export function transcriptText(c: any): string {
  const header = [
    `Call: ${c.call_id}`,
    `When: ${c.start_timestamp ? new Date(c.start_timestamp).toLocaleString() : '—'}`,
    `Workspace: ${c.workspace || '—'}   Agent: ${c.agent_name || '—'}`,
    `Direction: ${c.direction || '—'}   Disposition: ${c.disposition || '—'}   Sentiment: ${c.user_sentiment || '—'}`,
    c.call_summary ? `\nSUMMARY:\n${c.call_summary}` : '',
    '\nTRANSCRIPT:',
  ].join('\n');
  const turns = Array.isArray(c.transcript_object) ? c.transcript_object : [];
  const body = turns.length
    ? turns.map((t: any) => `${t.role === 'agent' ? 'AGENT' : 'CALLER'}: ${t.content}`).join('\n')
    : (c.transcript || '(no transcript)');
  return `${header}\n${body}\n`;
}

/** Download a single call's recording as MP3. */
export async function downloadCallMp3(c: any) {
  const blob = await fetchRecordingBlob(c.call_id);
  const mp3 = await toMp3(blob);
  saveBlob(mp3, `${fileStamp(c)}.mp3`);
}

/** Download one call's transcript as .txt (fetches full transcript first). */
export async function downloadCallTranscript(callId: string) {
  const { call } = await api.call(callId);
  saveBlob(new Blob([transcriptText(call)], { type: 'text/plain' }), `${fileStamp(call)}.txt`);
}

/** Bulk: zip MP3s (and optionally transcripts) for a set of calls. onProgress(done,total). */
export async function bulkDownload(
  calls: any[],
  opts: { audio: boolean; transcripts: boolean; onProgress?: (done: number, total: number) => void },
): Promise<void> {
  const zip = new JSZip();
  let done = 0;
  for (const c of calls) {
    try {
      const full = opts.transcripts ? (await api.call(c.call_id)).call : c;
      if (opts.audio && (c.recording_url || full.recording_url)) {
        const blob = await fetchRecordingBlob(c.call_id);
        const mp3 = await toMp3(blob);
        zip.file(`${fileStamp(c)}.mp3`, mp3);
      }
      if (opts.transcripts) {
        zip.file(`${fileStamp(c)}.txt`, transcriptText(full));
      }
    } catch (e) {
      zip.file(`${fileStamp(c)}_ERROR.txt`, `Failed to fetch: ${String((e as any)?.message ?? e)}`);
    }
    done++;
    opts.onProgress?.(done, calls.length);
  }
  const out = await zip.generateAsync({ type: 'blob' });
  saveBlob(out, `opm-calls-${new Date().toISOString().slice(0, 10)}.zip`);
}
