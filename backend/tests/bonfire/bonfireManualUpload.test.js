// Submission Readiness Engine v0.8 — manual RFP attachment upload tests.
//
// Mocks fs + the Sequelize models. Doesn't exercise pdf-parse / mammoth
// (those have their own coverage); just verifies orchestration: fs writes,
// row creation, idempotent re-upload, opp stamping.

// Spread real fs so winston (which the logger pulls in) can call fs.stat etc.,
// then override only the side-effecting methods we want to assert against.
jest.mock('fs', () => {
  const real = jest.requireActual('fs');
  // Uploaded bytes are never really written (writeFileSync is stubbed), so a
  // read-back of an upload path would ENOENT and silently null out extraction.
  // Stub reads for upload paths only; everything else (winston config etc.)
  // delegates to the real fs so logging still works.
  const isUploadPath = (p) => typeof p === 'string' && p.includes('uploads');
  return {
    ...real,
    mkdirSync: jest.fn(),
    writeFileSync: jest.fn(),
    existsSync: jest.fn(() => false),
    unlinkSync: jest.fn(),
    readFileSync: jest.fn((p, ...rest) => (
      isUploadPath(p) ? Buffer.from('STUB_BYTES') : real.readFileSync(p, ...rest)
    )),
  };
});

// DETERMINISTIC ISOLATION OF THE TEXT EXTRACTORS.
//
// bonfireManualUpload.extractText() lazy-requires mammoth (.docx) and
// utils/pdfText -> pdf-parse (.pdf) at call time. Cold-requiring those modules
// on this filesystem measures at ~12.3 s (mammoth) and ~2.6 s (pdf-parse),
// against Jest's 5 s default. In isolation the OS cache usually hides it; under
// full-directory parallelism it does not, which is precisely the intermittent
// failure this suite exhibited.
//
// The suite header already states it does not exercise pdf-parse / mammoth —
// they have their own coverage — so stubbing them is the correct scope, not a
// workaround. Every behavioural assertion below is unchanged, and extraction now
// returns a deterministic value instead of ENOENT-ing because fs.writeFileSync
// is mocked, which lets us assert that extracted text is actually persisted.
jest.mock('mammoth', () => ({
  extractRawText: jest.fn(async () => ({ value: 'STUB_DOCX_TEXT' })),
}));
jest.mock('../../src/utils/pdfText', () => ({
  extractPdfText: jest.fn(async () => 'STUB_PDF_TEXT'),
}));

jest.mock('../../src/models', () => ({
  BonfireOpportunity: { findByPk: jest.fn() },
  OpportunityAttachment: {
    findOne: jest.fn(),
    create: jest.fn(),
  },
}));

const fs = require('fs');
const { BonfireOpportunity, OpportunityAttachment } = require('../../src/models');
const svc = require('../../src/bonfire/bonfireManualUpload.service');

function makeOpp(overrides = {}) {
  return Object.assign({
    id: 'opp-1',
    title: 'Sample bid',
    submissionRequirements: null,
    attachmentsFetchedAt: null,
    save: jest.fn(async function save() { return this; }),
    changed: jest.fn(),
  }, overrides);
}

function makeFile(originalname, buf, mimetype = null) {
  return { originalname, buffer: buf, mimetype };
}

beforeEach(() => {
  fs.mkdirSync.mockClear();
  fs.writeFileSync.mockClear();
  fs.unlinkSync.mockClear();
  fs.existsSync.mockClear();
  BonfireOpportunity.findByPk.mockReset();
  OpportunityAttachment.findOne.mockReset();
  OpportunityAttachment.create.mockReset();
});

describe('bonfireManualUpload.ingestFiles', () => {
  it('throws NOT_FOUND when the opp does not exist', async () => {
    BonfireOpportunity.findByPk.mockResolvedValue(null);
    await expect(
      svc.ingestFiles({ bonfireOpportunityId: 'missing', files: [makeFile('a.pdf', Buffer.from('x'))] }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('saves new files, creates rows, stamps the opp', async () => {
    const opp = makeOpp();
    BonfireOpportunity.findByPk.mockResolvedValue(opp);
    OpportunityAttachment.findOne.mockResolvedValue(null);
    OpportunityAttachment.create.mockImplementation(async (row) => ({ id: 'attach-' + row.name, ...row }));

    const files = [
      makeFile('rfp.pdf', Buffer.from('pdf-bytes')),
      makeFile('appendix.docx', Buffer.from('docx-bytes')),
    ];
    const out = await svc.ingestFiles({ bonfireOpportunityId: 'opp-1', files, uploadedBy: 9 });

    expect(out.received).toBe(2);
    expect(out.saved).toBe(2);
    expect(out.failed).toBe(0);
    expect(out.files).toHaveLength(2);
    expect(out.files.every((f) => f.status === 'created')).toBe(true);
    expect(fs.writeFileSync).toHaveBeenCalledTimes(2);
    expect(OpportunityAttachment.create).toHaveBeenCalledTimes(2);
    expect(opp.attachmentsFetchedAt).toBeInstanceOf(Date);
    expect(opp.submissionRequirements.last_attachment_fetch.status).toBe('manual_upload');
    expect(opp.submissionRequirements.last_attachment_fetch.via).toBe('manual');
    expect(opp.save).toHaveBeenCalled();

    // NEW coverage, made possible by the deterministic extractor stubs: the
    // extracted text is actually routed onto the persisted row, per file type.
    // Previously extraction ENOENT'd (fs.writeFileSync is mocked, so the file it
    // tried to re-read never existed) and this could not be asserted at all.
    const rows = OpportunityAttachment.create.mock.calls.map(([r]) => r);
    const pdfRow = rows.find((r) => r.name === 'rfp.pdf');
    const docxRow = rows.find((r) => r.name === 'appendix.docx');
    expect(pdfRow.parsedText).toBe('STUB_PDF_TEXT');
    expect(docxRow.parsedText).toBe('STUB_DOCX_TEXT');
    // and the per-file result reflects it
    expect(out.files.every((f) => f.has_parsed_text === true)).toBe(true);
  });

  it('updates existing rows on re-upload with the same filename (idempotent)', async () => {
    const opp = makeOpp();
    BonfireOpportunity.findByPk.mockResolvedValue(opp);
    const existing = {
      id: 'attach-old',
      filePath: 'opportunities/opp-1/old-rfp.pdf',
      metadata: { uploaded_by: 1 },
      save: jest.fn(async function save() { return this; }),
    };
    OpportunityAttachment.findOne.mockResolvedValue(existing);
    fs.existsSync.mockReturnValue(true);

    const files = [makeFile('rfp.pdf', Buffer.from('new-bytes'))];
    const out = await svc.ingestFiles({ bonfireOpportunityId: 'opp-1', files, uploadedBy: 2 });

    expect(out.saved).toBe(1);
    expect(out.files[0].status).toBe('updated');
    expect(existing.save).toHaveBeenCalled();
    expect(OpportunityAttachment.create).not.toHaveBeenCalled();
    // Prior file got cleaned up.
    expect(fs.unlinkSync).toHaveBeenCalled();
  });

  it('rejects oversize files but keeps processing the rest', async () => {
    const opp = makeOpp();
    BonfireOpportunity.findByPk.mockResolvedValue(opp);
    OpportunityAttachment.findOne.mockResolvedValue(null);
    OpportunityAttachment.create.mockImplementation(async (row) => ({ id: 'a', ...row }));

    const huge = Buffer.alloc(60 * 1024 * 1024); // 60 MB > 50 MB cap
    const ok = Buffer.from('ok');
    const out = await svc.ingestFiles({
      bonfireOpportunityId: 'opp-1',
      files: [makeFile('huge.pdf', huge), makeFile('ok.pdf', ok)],
    });
    expect(out.received).toBe(2);
    expect(out.saved).toBe(1);
    expect(out.failed).toBe(1);
    expect(out.files.find((f) => f.name === 'huge.pdf').reason).toBe('oversize');
  });

  it('rejects buffers that are missing entirely', async () => {
    const opp = makeOpp();
    BonfireOpportunity.findByPk.mockResolvedValue(opp);
    const out = await svc.ingestFiles({
      bonfireOpportunityId: 'opp-1',
      files: [{ originalname: 'a.pdf', buffer: null }],
    });
    expect(out.failed).toBe(1);
    expect(out.files[0].reason).toBe('no_buffer');
  });

  it('preserves prior last_attachment_fetch.status when nothing succeeded', async () => {
    const opp = makeOpp({
      submissionRequirements: { last_attachment_fetch: { status: 'blocked', at: '2026-05-01' } },
    });
    BonfireOpportunity.findByPk.mockResolvedValue(opp);
    const out = await svc.ingestFiles({
      bonfireOpportunityId: 'opp-1',
      files: [{ originalname: 'a.pdf', buffer: null }],
    });
    expect(out.saved).toBe(0);
    // Still stamps an at and via=manual, but keeps the prior blocked status.
    expect(opp.submissionRequirements.last_attachment_fetch.status).toBe('blocked');
    expect(opp.submissionRequirements.last_attachment_fetch.via).toBe('manual');
  });
});
