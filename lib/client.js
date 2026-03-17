/**
 * Sweetbook JavaScript SDK — Client
 * Books, Photos, Covers, Contents, Orders, Credits
 *
 * Usage:
 *   const { SweetbookClient } = require('./lib/client');
 *   const client = new SweetbookClient({ apiKey: 'SB...' });
 *   const book = await client.books.create({ bookSpecUid: 'SQUAREBOOK_HC', title: 'My Book' });
 */

const { BaseClient, ResponseParser, SweetbookValidationError } = require('./core');

// ============================================================
// Books Client
// ============================================================

class BooksClient extends BaseClient {
  async list(params = {}) {
    const { status, limit = 20, offset = 0 } = params;
    const body = await this._get('/Books', { status, limit, offset });
    return new ResponseParser(body).getDict();
  }

  async create(data) {
    const { bookSpecUid, title, creationType = 'NORMAL', ...extraData } = data;
    if (!bookSpecUid) throw new SweetbookValidationError('bookSpecUid is required', 'bookSpecUid');
    const payload = { bookSpecUid, creationType, ...extraData };
    if (title) payload.title = title;
    const body = await this._post('/Books', payload);
    return new ResponseParser(body).getDict();
  }

  async get(bookUid) {
    this._requireParam(bookUid, 'bookUid');
    const body = await this._get(`/Books/${bookUid}`);
    return new ResponseParser(body).getDict();
  }

  async finalize(bookUid) {
    this._requireParam(bookUid, 'bookUid');
    const body = await this._post(`/Books/${bookUid}/finalization`, {});
    return new ResponseParser(body).getDict();
  }

  async delete(bookUid) {
    this._requireParam(bookUid, 'bookUid');
    return this._delete(`/Books/${bookUid}`);
  }
}

// ============================================================
// Photos Client
// ============================================================

class PhotosClient extends BaseClient {
  async upload(bookUid, file, options = {}) {
    this._requireParam(bookUid, 'bookUid');
    const fd = new FormData();
    fd.append('file', file);
    if (options.preserveExif) fd.append('preserveExif', 'true');
    const body = await this._postForm(`/Books/${bookUid}/photos`, fd);
    return new ResponseParser(body).getData();
  }

  async list(bookUid) {
    this._requireParam(bookUid, 'bookUid');
    const body = await this._get(`/Books/${bookUid}/photos`);
    return new ResponseParser(body).getDict();
  }

  async delete(bookUid, fileName) {
    this._requireParam(bookUid, 'bookUid');
    return this._delete(`/Books/${bookUid}/photos/${fileName}`);
  }
}

// ============================================================
// Covers Client
// ============================================================

class CoversClient extends BaseClient {
  async create(bookUid, templateUid, parameters, files) {
    this._requireParam(bookUid, 'bookUid');
    this._requireParam(templateUid, 'templateUid');
    const fd = this._buildTemplateFormData(templateUid, parameters, files, 'files');
    const body = await this._postForm(`/Books/${bookUid}/cover`, fd);
    return new ResponseParser(body).getData();
  }

  async get(bookUid) {
    this._requireParam(bookUid, 'bookUid');
    const body = await this._get(`/Books/${bookUid}/cover`);
    return new ResponseParser(body).getDict();
  }

  async delete(bookUid) {
    this._requireParam(bookUid, 'bookUid');
    return this._delete(`/Books/${bookUid}/cover`);
  }
}

// ============================================================
// Contents Client
// ============================================================

class ContentsClient extends BaseClient {
  async insert(bookUid, templateUid, parameters, options = {}) {
    this._requireParam(bookUid, 'bookUid');
    this._requireParam(templateUid, 'templateUid');
    const { files, breakBefore } = options;
    const fd = this._buildTemplateFormData(templateUid, parameters, files, 'rowPhotos');
    const params = {};
    if (breakBefore) params.breakBefore = breakBefore;
    const body = await this._request('POST', `/Books/${bookUid}/contents`, { formData: fd, params });
    const data = new ResponseParser(body).getData();
    if (body?.cursor && data && typeof data === 'object') {
      data.pageNum = body.cursor.pageNum;
      data.pageSide = body.cursor.pageSide;
    }
    return data;
  }

  async clear(bookUid) {
    this._requireParam(bookUid, 'bookUid');
    return this._delete(`/Books/${bookUid}/contents`);
  }
}

// ============================================================
// Orders Client
// ============================================================

class OrdersClient extends BaseClient {
  async estimate(data) {
    this._requireParam(data?.items?.length, 'items');
    const body = await this._post('/orders/estimate', data);
    return new ResponseParser(body).getDict();
  }

  async create(data) {
    this._requireParam(data?.items?.length, 'items');
    this._requireParam(data?.shipping?.recipientName, 'shipping.recipientName');
    const body = await this._post('/orders', data);
    return new ResponseParser(body).getDict();
  }

  async list(params = {}) {
    const { limit = 20, offset = 0, status, from, to } = params;
    const body = await this._get('/orders', { limit, offset, status, from, to });
    return new ResponseParser(body).getDict();
  }

  async get(orderUid) {
    this._requireParam(orderUid, 'orderUid');
    const body = await this._get(`/orders/${orderUid}`);
    return new ResponseParser(body).getDict();
  }

  async cancel(orderUid, cancelReason) {
    this._requireParam(orderUid, 'orderUid');
    this._requireParam(cancelReason, 'cancelReason');
    const body = await this._post(`/orders/${orderUid}/cancel`, { cancelReason });
    return new ResponseParser(body).getDict();
  }

  async updateShipping(orderUid, shippingData) {
    this._requireParam(orderUid, 'orderUid');
    const body = await this._patch(`/orders/${orderUid}/shipping`, shippingData);
    return new ResponseParser(body).getDict();
  }
}

// ============================================================
// Credits Client
// ============================================================

class CreditsClient extends BaseClient {
  async getBalance() {
    const body = await this._get('/credits');
    return new ResponseParser(body).getDict();
  }

  async transactions(params = {}) {
    const { limit = 20, offset = 0, from, to } = params;
    const body = await this._get('/credits/transactions', { limit, offset, from, to });
    return new ResponseParser(body).getDict();
  }

  async sandboxCharge(amount, memo) {
    this._requireParam(amount, 'amount');
    const body = await this._post('/credits/sandbox/charge', { amount, memo });
    return new ResponseParser(body).getDict();
  }
}

// ============================================================
// Main Client
// ============================================================

class SweetbookClient {
  /**
   * @param {Object} options
   * @param {string} options.apiKey - API key (required)
   * @param {string} [options.baseUrl] - API base URL
   * @param {string} [options.environment] - 'sandbox' | 'live' (default: 'live')
   * @param {number} [options.timeout] - Request timeout in ms (default: 30000)
   */
  constructor(options = {}) {
    if (!options.apiKey) {
      throw new SweetbookValidationError('apiKey is required', 'apiKey');
    }
    this._apiKey = options.apiKey;
    this._adminApiKey = null;
    this._useCookie = false;
    this._timeout = options.timeout || 30000;

    if (options.baseUrl) {
      this._baseUrl = options.baseUrl;
    } else if (options.environment === 'sandbox') {
      this._baseUrl = 'https://api-sandbox.sweetbook.com/v1';
    } else {
      this._baseUrl = 'https://api.sweetbook.com/v1';
    }

    this.books = new BooksClient(this);
    this.photos = new PhotosClient(this);
    this.covers = new CoversClient(this);
    this.contents = new ContentsClient(this);
    this.orders = new OrdersClient(this);
    this.credits = new CreditsClient(this);
  }
}

module.exports = {
  SweetbookClient,
  BooksClient,
  PhotosClient,
  CoversClient,
  ContentsClient,
  OrdersClient,
  CreditsClient,
};
