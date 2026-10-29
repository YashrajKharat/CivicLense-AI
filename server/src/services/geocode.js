import { HttpError } from "../middleware/errors.js";

/**
 * Turns coordinates into a readable address.
 *
 * Nominatim is OpenStreetMap's own service: free, no key, and their usage
 * policy asks for an identifying User-Agent and no more than one request a
 * second. Both are honoured below — a project that ignored that would get the
 * whole IP blocked, which is a poor trade for a marginally faster demo.
 *
 * The address is a convenience. The coordinate is the record, so a geocoding
 * failure must never block a report.
 */
const ENDPOINT = "https://nominatim.openstreetmap.org/reverse";
const MIN_GAP_MS = 1100;

let lastCall = 0;
const cache = new Map();

const keyFor = (lat, lng) => `${lat.toFixed(4)},${lng.toFixed(4)}`;

/**
 * Address search. GPS is wrong indoors and useless when reporting something
 * seen earlier, so a resident needs to be able to type "LBS Marg Ghatkopar"
 * and drop the pin there.
 *
 * Biased to Mumbai and restricted to India — an unbiased search returns
 * Springfield, Massachusetts for half of what people type.
 */
export async function searchAddress(text, near) {
  const query = String(text || "").trim();
  if (query.length < 3) return [];

  const wait = MIN_GAP_MS - (Date.now() - lastCall);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();

  const params = new URLSearchParams({
    format: "jsonv2",
    q: query,
    countrycodes: "in",
    limit: "6",
    addressdetails: "1",
  });

  // Results near the map's current centre first, which is almost always what
  // someone means when they type a street name.
  if (near?.lat && near?.lng) {
    const d = 0.35;
    params.set(
      "viewbox",
      `${Number(near.lng) - d},${Number(near.lat) + d},${Number(near.lng) + d},${Number(near.lat) - d}`
    );
    params.set("bounded", "0");
  }

  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: {
      "User-Agent": "CivicLense/1.0 (municipal complaint platform)",
      "Accept-Language": "en",
    },
  });

  if (!res.ok) throw new HttpError(502, "Address search is unavailable.");

  const data = await res.json();

  return data.map((r) => {
    const a = r.address || {};
    return {
      lat: Number(r.lat),
      lng: Number(r.lon),
      // The distinctive part first, so a list of six is scannable.
      title: r.name || a.road || a.suburb || r.display_name.split(",")[0],
      subtitle: [a.suburb || a.neighbourhood, a.city || a.town, a.postcode]
        .filter(Boolean)
        .join(", "),
      full: r.display_name,
    };
  });
}

export async function reverseGeocode(lat, lng) {
  const key = keyFor(Number(lat), Number(lng));
  if (cache.has(key)) return cache.get(key);

  const wait = MIN_GAP_MS - (Date.now() - lastCall);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();

  const url = `${ENDPOINT}?format=jsonv2&lat=${lat}&lon=${lng}&addressdetails=1&zoom=18`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "CivicLense/1.0 (municipal complaint platform)",
      "Accept-Language": "en",
    },
  });

  if (!res.ok) throw new HttpError(502, "The address lookup is unavailable.");

  const data = await res.json();
  const a = data.address || {};

  // Nominatim's field names vary by place, so each part falls back through the
  // plausible alternatives rather than assuming one shape.
  const result = {
    full: data.display_name || null,
    road: a.road || a.pedestrian || a.footway || null,
    neighbourhood: a.neighbourhood || a.suburb || a.residential || a.quarter || null,
    area: a.suburb || a.city_district || a.county || null,
    city: a.city || a.town || a.village || a.municipality || null,
    state: a.state || null,
    pincode: a.postcode || null,
    /* A short line for a list, built from the most locally useful parts. */
    short: [a.road || a.pedestrian, a.neighbourhood || a.suburb, a.city || a.town]
      .filter(Boolean)
      .join(", ") || data.display_name || null,
  };

  cache.set(key, result);
  if (cache.size > 500) cache.delete(cache.keys().next().value);

  return result;
}
