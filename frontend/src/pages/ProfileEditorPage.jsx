import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { getProfile, saveProfile } from '../services/oiedService';

// Comma-separated chip editor — used for services / industries / tools / past wins.
function CSV({ label, value, onChange, placeholder, hint }) {
  const text = Array.isArray(value) ? value.join(', ') : '';
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">
        {label}
      </label>
      <input
        type="text"
        defaultValue={text}
        placeholder={placeholder}
        onBlur={(e) => onChange(
          e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
        )}
        className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 rounded px-3 py-2 text-sm"
      />
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

function ProfileEditorPage() {
  const { user } = useSelector((s) => s.auth);
  const [profile, setProfile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState(null);
  const [isDefault, setIsDefault] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await getProfile();
        if (cancelled) return;
        setProfile({
          services: p.services || [],
          industries: p.industries || [],
          tools: p.tools || [],
          pastWins: p.pastWins || [],
          minDealSize: p.minDealSize || 0,
          riskTolerance: p.riskTolerance || 'medium',
          preferences: p.preferences || {},
        });
        setIsDefault(!!p._isDefault);
      } catch (e) {
        setBanner({ kind: 'err', text: e?.response?.data?.message || e.message });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function handleSave() {
    setSaving(true);
    setBanner(null);
    try {
      const saved = await saveProfile(profile);
      setProfile({
        services: saved.services || [],
        industries: saved.industries || [],
        tools: saved.tools || [],
        pastWins: saved.pastWins || [],
        minDealSize: saved.minDealSize || 0,
        riskTolerance: saved.riskTolerance || 'medium',
        preferences: saved.preferences || {},
      });
      setIsDefault(false);
      setBanner({ kind: 'ok', text: 'Profile saved. Fit scores will recompute on next load.' });
    } catch (e) {
      setBanner({ kind: 'err', text: e?.response?.data?.message || e.message });
    } finally {
      setSaving(false);
    }
  }

  if (!user) return <div className="p-6 text-center text-gray-500">Please log in.</div>;
  if (!profile) return <div className="p-6 text-center text-gray-500">Loading…</div>;

  return (
    <div className="p-6">
      <div className="max-w-3xl mx-auto">
        <header className="mb-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            🧬 Business Profile
            <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200 font-medium">
              OIED
            </span>
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Drives fit scoring on the My Opportunities page. Your profile is private to you.
            {isDefault && (
              <span className="ml-2 text-amber-700 dark:text-amber-300">
                Currently using the global default — save to personalize.
              </span>
            )}
          </p>
        </header>

        {banner && (
          <div
            className={`p-2 rounded text-sm mb-3 ${
              banner.kind === 'ok'
                ? 'bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-200'
                : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-200'
            }`}
            data-testid="profile-banner"
          >
            {banner.text}
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-5" data-testid="profile-editor">
          <CSV
            label="Services"
            value={profile.services}
            placeholder="ai-systems, data-analytics, automation"
            hint="Lowercase tokens that match opportunity tags. Each match boosts service_match (max 25)."
            onChange={(v) => setProfile({ ...profile, services: v })}
          />
          <CSV
            label="Industries"
            value={profile.industries}
            placeholder="IT Services, Compliance, Staffing"
            hint="Categories you fit. Industry match contributes to strategic_alignment (max 15)."
            onChange={(v) => setProfile({ ...profile, industries: v })}
          />
          <CSV
            label="Tools"
            value={profile.tools}
            placeholder="OpenAI, Snowflake, Tableau"
            hint="Stack you operate. Recorded for matching — not yet wired into scoring."
            onChange={(v) => setProfile({ ...profile, tools: v })}
          />
          <CSV
            label="Past Wins"
            value={profile.pastWins}
            placeholder="DHA compliance audit, City of Austin data analytics"
            hint="Free-text titles. Token overlap with new opportunities boosts strategic_alignment."
            onChange={(v) => setProfile({ ...profile, pastWins: v })}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">
                Minimum deal size (USD)
              </label>
              <input
                type="number"
                min="0"
                value={profile.minDealSize}
                onChange={(e) => setProfile({ ...profile, minDealSize: Number(e.target.value) })}
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 rounded px-3 py-2 text-sm"
                data-testid="min-deal-size"
              />
              <p className="mt-1 text-xs text-gray-500">
                Opportunities below this hit revenue_weight=0 (effectively excluded).
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">
                Risk tolerance
              </label>
              <select
                value={profile.riskTolerance}
                onChange={(e) => setProfile({ ...profile, riskTolerance: e.target.value })}
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 rounded px-3 py-2 text-sm"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Reserved for future scoring tweaks.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            data-testid="save-profile-btn"
          >
            {saving ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ProfileEditorPage;
