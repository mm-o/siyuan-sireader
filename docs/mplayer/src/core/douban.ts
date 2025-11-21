// =============================================================================
// Douban API Service (via Siyuan Forward Proxy)
// =============================================================================
// Provides functions to fetch accurate movie details from the Douban API.

const DOUBAN_MOBILE_API_BASE = 'https://m.douban.com/rexxar/api/v2';
const PROXY_URL = '/api/network/forwardProxy';

/**
 * Fetches data from the Douban Mobile API using Siyuan's forward proxy.
 * @param path The API path (e.g., '/search/subjects').
 * @param params URL query parameters.
 * @returns The parsed JSON response.
 */
async function doubanFetch(path: string, params: Record<string, any> = {}) {
  const targetUrl = new URL(`${DOUBAN_MOBILE_API_BASE}${path}`);
  Object.entries(params).forEach(([key, value]) => targetUrl.searchParams.append(key, String(value)));

  try {
    const res = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: targetUrl.toString(),
        method: 'GET',
        timeout: 7000,
        headers: [{ 'Referer': 'https://m.douban.com/' }]
      })
    }).then(r => r.json());

    if (res.code !== 0) throw new Error(`Proxy request failed: ${res.msg}`);

    return JSON.parse(res.data.body);
  } catch (error) {
    console.error('Douban Mobile API fetch error:', error);
    return null;
  }
}

/**
 * Searches for a movie by its title and returns the best match.
 * @param query The movie title to search for.
 * @returns The first movie object from the search results, or null if not found.
 */
export async function searchMovie(query: string): Promise<any | null> {
  const data = await doubanFetch('/search/subjects', { q: query, type: 'movie', count: 1 });
  const movieItem = data?.subjects?.items?.[0];
  if (!movieItem) return null;
  // The ID is in `target_id`, the rest of the info is in `target`
  return { id: movieItem.target_id, ...movieItem.target };
}

/**
 * Fetches detailed information for a specific movie by its Douban ID.
 * @param id The Douban movie ID.
 * @returns A detailed movie object, or null on failure.
 */
export async function getMovieDetail(id: string): Promise<any | null> {
  if (!id) return null;
  return await doubanFetch(`/movie/${id}`);
}

