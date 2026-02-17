/**
 * BaseAdapter — Abstract base class for all data source adapters.
 *
 * Subclasses must implement:
 *   fetch()      — retrieve raw records from the external source
 *   transform()  — convert raw records into the Opportunity model shape
 */
class BaseAdapter {
  /**
   * @param {object} dataSource - The DataSource model instance.
   */
  constructor(dataSource) {
    if (new.target === BaseAdapter) {
      throw new Error('BaseAdapter is abstract and cannot be instantiated directly.');
    }
    this.dataSource = dataSource;
  }

  /**
   * Fetch raw records from the external data source.
   * @returns {Promise<Array>} Array of raw records.
   */
  async fetch() {
    throw new Error('fetch() must be implemented by subclass.');
  }

  /**
   * Transform raw records into the Opportunity model shape.
   * @param {Array} rawRecords - Raw records returned by fetch().
   * @returns {Array} Array of objects conforming to Opportunity fields.
   */
  transform(rawRecords) {
    throw new Error('transform() must be implemented by subclass.');
  }
}

module.exports = BaseAdapter;
