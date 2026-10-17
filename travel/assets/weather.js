/* 날씨 — Open-Meteo (키 없음). 숙소 좌표의 일별 예보, 3시간 캐시 */
import { LS } from './store.js';

const TTL = 3 * 3600 * 1000;
export const WMO = {
  0: ['맑음', '☀️'], 1: ['대체로 맑음', '🌤️'], 2: ['구름 조금', '⛅'], 3: ['흐림', '☁️'], 45: ['안개', '🌫️'], 48: ['안개', '🌫️'],
  51: ['이슬비', '🌦️'], 53: ['이슬비', '🌦️'], 55: ['이슬비', '🌦️'], 56: ['어는 이슬비', '🌧️'], 57: ['어는 이슬비', '🌧️'],
  61: ['비', '🌧️'], 63: ['비', '🌧️'], 65: ['강한 비', '🌧️'], 66: ['어는 비', '🌧️'], 67: ['어는 비', '🌧️'],
  71: ['눈', '🌨️'], 73: ['눈', '🌨️'], 75: ['많은 눈', '❄️'], 77: ['싸락눈', '🌨️'], 80: ['소나기', '🌦️'], 81: ['소나기', '🌧️'], 82: ['강한 소나기', '⛈️'],
  85: ['눈 소나기', '🌨️'], 86: ['눈 소나기', '🌨️'], 95: ['뇌우', '⛈️'], 96: ['뇌우·우박', '⛈️'], 99: ['뇌우·우박', '⛈️'],
};
export const RAINY = 60;   // 강수확률 % 이상이면 우천 안 제안

export async function forecast(lat, lng, tz) {
  const key = `ta:wx:${lat.toFixed(3)},${lng.toFixed(3)}`;
  const c = LS.json(key, null);
  if (c && Date.now() - c.at < TTL) return c.days;
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lng
    + '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code'
    + '&timezone=' + encodeURIComponent(tz || 'auto') + '&forecast_days=16';
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const j = await res.json(), d = j.daily || {}, days = {};
    (d.time || []).forEach((date, i) => {
      days[date] = { max: d.temperature_2m_max[i], min: d.temperature_2m_min[i],
        pop: d.precipitation_probability_max[i], code: d.weather_code[i] };
    });
    LS.setJson(key, { at: Date.now(), days });
    return days;
  } catch {
    return c ? c.days : null;              // 오프라인이면 지난 예보라도
  }
}
export function wxLabel(w) {
  if (!w) return null;
  const [txt, ico] = WMO[w.code] || ['', ''];
  return { icon: ico, text: txt, temp: `${Math.round(w.min)}°/${Math.round(w.max)}°`, pop: w.pop };
}
