export interface Wallpaper {
  id: string;
  resolution: string;
  thumbUrl: string;
  fullUrl: string;
}

export interface SearchPage {
  items: Wallpaper[];
  page: number;
  lastPage: number;
}

export interface SearchParams {
  query: string;
  categories: string; // e.g. "111" = general/anime/people
  sorting: "toplist" | "relevance";
  page: number;
}
