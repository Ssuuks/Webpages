/* 날씨 — Open-Meteo (키 없음). 숙소 좌표의 일별·시간별 예보(강수확률·바람), 3시간 캐시 */
import { LS } from './store.js';

const TTL = 3 * 3600 * 1000;
export const WMO = {
  0: ['맑음', '☀️'], 1: ['대체로 맑음', '🌤️'], 2: ['구름 조금', '⛅'], 3: ['흐림', '☁️'], 45: ['안개', '🌫️'], 48: ['안개', '🌫️'],
  51: ['이슬비', '🌦️'], 53: ['이슬비', '🌦️'], 55: ['이슬비', '🌦️'], 56: ['어는 이슬비', '🌧️'], 57: ['어는 이슬비', '🌧️'],
  61: ['비', '🌧️'], 63: ['비', '🌧️'], 65: ['강한 비', '🌧️'], 66: ['어는 비', '🌧️'], 67: ['어는 비', '🌧️'],
  71: ['눈', '🌨️'], 73: ['눈', '🌨️'], 75: ['많은 눈', '❄️'], 77: ['싸락눈', '🌨️'], 80: ['소나기', '🌦️'], 81: ['소나기', '🌧️'], 82: ['강한 소나기', '⛈️'],
  85: ['눈 소나기', '🌨️'], 86: ['눈 소나기', '🌨️'], 95: ['뇌우', '⛈️'], 96: ['뇌우·우박', '⛈️'], 99: ['뇌우·우박', '⛈️'],
};
export const RAINY = 60;        // 강수확률 % 이상이면 우천 안 제안
export const GUSTY = 14;        // 돌풍 m/s 이상이면 '바람 강함'
/* 기상청 강풍주의보 기준(육상: 풍속 14m/s 또는 순간풍속 20m/s 이상)에 가까우면 '강풍' */
export const isStormy = (h) => h && ((h.wind != null && h.wind >= 14) || (h.gust != null && h.gust >= 20));

export async function forecastFull(lat, lng, tz) {
  const key = `ta:wx2:${lat.toFixed(3)},${lng.toFixed(3)}`;
  const c = LS.json(key, null);
  if (c && Date.now() - c.at < TTL) return c;
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lng
    + '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code,wind_gusts_10m_max'
    + '&hourly=temperature_2m,precipitation_probability,weather_code,wind_speed_10m,wind_gusts_10m'
    + '&wind_speed_unit=ms&timezone=' + encodeURIComponent(tz || 'auto') + '&forecast_days=16';
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const j = await res.json(), d = j.daily || {}, hr = j.hourly || {}, days = {}, hours = {};
    (d.time || []).forEach((date, i) => {
      days[date] = { max: d.temperature_2m_max[i], min: d.temperature_2m_min[i], pop: d.precipitation_probability_max[i],
        code: d.weather_code[i], gust: d.wind_gusts_10m_max ? d.wind_gusts_10m_max[i] : null };
    });
    (hr.time || []).forEach((t, i) => {
      hours[t] = { temp: hr.temperature_2m[i], pop: hr.precipitation_probability[i], code: hr.weather_code[i],
        wind: hr.wind_speed_10m[i], gust: hr.wind_gusts_10m[i] };
    });
    const out = { at: Date.now(), days, hours };
    try { LS.setJson(key, out); } catch { /* 저장 공간 부족 */ }
    return out;
  } catch {
    return c || null;                       // 오프라인이면 지난 예보라도
  }
}
export async function forecast(lat, lng, tz) { const f = await forecastFull(lat, lng, tz); return f ? f.days : null; }
export function wxLabel(w) {
  if (!w) return null;
  const [txt, ico] = WMO[w.code] || ['', ''];
  return { icon: ico, text: txt, temp: `${Math.round(w.min)}°/${Math.round(w.max)}°`, pop: w.pop, gust: w.gust };
}
/* 그 날짜의 시간별 예보 (from~to시) */
export function hoursOf(full, date, from = 0, to = 23) {
  if (!full || !full.hours) return [];
  const out = [];
  for (let hh = from; hh <= to; hh++) {
    const k = `${date}T${String(hh).padStart(2, '0')}:00`;
    if (full.hours[k]) out.push({ t: k, ...full.hours[k] });
  }
  return out;
}
