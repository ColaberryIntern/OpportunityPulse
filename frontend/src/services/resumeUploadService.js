import api from './api';

const resumeUploadService = {
  /**
   * Upload a PDF resume and extract profile data via AI.
   * Returns extracted data for user review — does NOT auto-save.
   */
  uploadResume: (file) => {
    const formData = new FormData();
    formData.append('resume', file);
    return api.post('/resume-upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 30000,
    });
  },

  /**
   * Confirm and save the reviewed/edited profile data.
   */
  confirmExtraction: (profileData) =>
    api.post('/resume-upload/confirm', { profileData }),
};

export default resumeUploadService;
