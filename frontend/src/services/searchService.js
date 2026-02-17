import api from './api';

const searchService = {
  search: ({ q, category, tags, status, dateFrom, dateTo, page = 1, limit = 20, sort } = {}) => {
    const params = new URLSearchParams({ page, limit });
    if (q) params.append('q', q);
    if (category) params.append('category', category);
    if (tags) params.append('tags', tags);
    if (status) params.append('status', status);
    if (dateFrom) params.append('dateFrom', dateFrom);
    if (dateTo) params.append('dateTo', dateTo);
    if (sort) params.append('sort', sort);
    return api.get(`/search?${params.toString()}`);
  },
};

export default searchService;
