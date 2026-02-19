import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import intelligenceService from '../../services/intelligenceService';

export const fetchDomains = createAsyncThunk(
  'intelligence/fetchDomains',
  async (_, { rejectWithValue }) => {
    try {
      const response = await intelligenceService.getDomains();
      return response.data.domains;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch domains');
    }
  }
);

export const fetchCapabilities = createAsyncThunk(
  'intelligence/fetchCapabilities',
  async (_, { rejectWithValue }) => {
    try {
      const response = await intelligenceService.getCapabilities();
      return response.data.capabilities;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch capabilities');
    }
  }
);

export const fetchIntents = createAsyncThunk(
  'intelligence/fetchIntents',
  async (_, { rejectWithValue }) => {
    try {
      const response = await intelligenceService.getIntents();
      return response.data.intents;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch intents');
    }
  }
);

export const fetchClusters = createAsyncThunk(
  'intelligence/fetchClusters',
  async (_, { rejectWithValue }) => {
    try {
      const response = await intelligenceService.getClusters();
      return response.data.clusters;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch clusters');
    }
  }
);

export const fetchMetaSignals = createAsyncThunk(
  'intelligence/fetchMetaSignals',
  async (_, { rejectWithValue }) => {
    try {
      const response = await intelligenceService.getMetaSignals();
      return response.data.metaSignals;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch meta signals');
    }
  }
);

export const fetchHeatmap = createAsyncThunk(
  'intelligence/fetchHeatmap',
  async (_, { rejectWithValue }) => {
    try {
      const response = await intelligenceService.getHeatmap();
      return response.data.heatmap;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch heatmap');
    }
  }
);

export const fetchAllDimensions = createAsyncThunk(
  'intelligence/fetchAllDimensions',
  async (_, { rejectWithValue }) => {
    try {
      const [domains, capabilities, intents, monetization, maturity, geo] = await Promise.all([
        intelligenceService.getDomains(),
        intelligenceService.getCapabilities(),
        intelligenceService.getIntents(),
        intelligenceService.getMonetizationAngles(),
        intelligenceService.getMaturityPhases(),
        intelligenceService.getGeographicTags(),
      ]);
      return {
        domains: domains.data.domains,
        capabilities: capabilities.data.capabilities,
        intents: intents.data.intents,
        monetizationAngles: monetization.data.monetizationAngles,
        maturityPhases: maturity.data.maturityPhases,
        geographicTags: geo.data.geographicTags,
      };
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch dimensions');
    }
  }
);

const intelligenceSlice = createSlice({
  name: 'intelligence',
  initialState: {
    domains: [],
    capabilities: [],
    intents: [],
    monetizationAngles: [],
    maturityPhases: [],
    geographicTags: [],
    clusters: [],
    metaSignals: [],
    heatmap: [],
    dimensionsLoading: false,
    clustersLoading: false,
    signalsLoading: false,
    heatmapLoading: false,
    error: null,
  },
  reducers: {
    clearIntelligenceError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch all dimensions
      .addCase(fetchAllDimensions.pending, (state) => {
        state.dimensionsLoading = true;
        state.error = null;
      })
      .addCase(fetchAllDimensions.fulfilled, (state, action) => {
        state.dimensionsLoading = false;
        state.domains = action.payload.domains;
        state.capabilities = action.payload.capabilities;
        state.intents = action.payload.intents;
        state.monetizationAngles = action.payload.monetizationAngles;
        state.maturityPhases = action.payload.maturityPhases;
        state.geographicTags = action.payload.geographicTags;
      })
      .addCase(fetchAllDimensions.rejected, (state, action) => {
        state.dimensionsLoading = false;
        state.error = action.payload;
      })
      // Individual fetches
      .addCase(fetchDomains.fulfilled, (state, action) => { state.domains = action.payload; })
      .addCase(fetchCapabilities.fulfilled, (state, action) => { state.capabilities = action.payload; })
      .addCase(fetchIntents.fulfilled, (state, action) => { state.intents = action.payload; })
      // Clusters
      .addCase(fetchClusters.pending, (state) => { state.clustersLoading = true; })
      .addCase(fetchClusters.fulfilled, (state, action) => {
        state.clustersLoading = false;
        state.clusters = action.payload;
      })
      .addCase(fetchClusters.rejected, (state, action) => {
        state.clustersLoading = false;
        state.error = action.payload;
      })
      // Meta signals
      .addCase(fetchMetaSignals.pending, (state) => { state.signalsLoading = true; })
      .addCase(fetchMetaSignals.fulfilled, (state, action) => {
        state.signalsLoading = false;
        state.metaSignals = action.payload;
      })
      .addCase(fetchMetaSignals.rejected, (state, action) => {
        state.signalsLoading = false;
        state.error = action.payload;
      })
      // Heatmap
      .addCase(fetchHeatmap.pending, (state) => { state.heatmapLoading = true; })
      .addCase(fetchHeatmap.fulfilled, (state, action) => {
        state.heatmapLoading = false;
        state.heatmap = action.payload;
      })
      .addCase(fetchHeatmap.rejected, (state, action) => {
        state.heatmapLoading = false;
        state.error = action.payload;
      });
  },
});

export const { clearIntelligenceError } = intelligenceSlice.actions;
export default intelligenceSlice.reducer;
