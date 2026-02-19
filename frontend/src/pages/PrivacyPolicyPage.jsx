import React from 'react';
import { Link } from 'react-router-dom';

function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-8 sm:p-12">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Privacy Policy
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
            Last updated: February 18, 2026
          </p>

          {/* Introduction */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">
              1. Introduction
            </h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              Opportunity Pulse ("we", "our", or "us") is committed to protecting your privacy. This
              Privacy Policy explains how we collect, use, store, and share your personal data when
              you use our AI-powered government contract insights platform. We comply with the
              General Data Protection Regulation (GDPR) and other applicable data protection laws.
            </p>
          </section>

          {/* Data We Collect */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">
              2. Data We Collect
            </h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-3">
              We collect and process the following categories of personal data:
            </p>
            <ul className="list-disc list-inside text-gray-700 dark:text-gray-300 space-y-2 ml-2">
              <li>
                <strong className="text-gray-900 dark:text-gray-100">Profile Information:</strong>{' '}
                Email address, name, company name, and professional interests you provide during
                registration and profile setup.
              </li>
              <li>
                <strong className="text-gray-900 dark:text-gray-100">Activity Data:</strong>{' '}
                Records of your interactions with the platform, including searches, page views,
                content you access, and opportunities you save or interact with.
              </li>
              <li>
                <strong className="text-gray-900 dark:text-gray-100">Preferences & Settings:</strong>{' '}
                Alert preferences, notification settings, saved searches, and behavioral profiles
                used to personalize your experience.
              </li>
              <li>
                <strong className="text-gray-900 dark:text-gray-100">User-Generated Content:</strong>{' '}
                Forum posts, comments, feedback submissions, and any content you create on the
                platform.
              </li>
              <li>
                <strong className="text-gray-900 dark:text-gray-100">Technical Data:</strong>{' '}
                API keys (hashed), webhook configurations, subscription details, and session
                information necessary for platform functionality.
              </li>
            </ul>
          </section>

          {/* How We Use Your Data */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">
              3. How We Use Your Data
            </h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-3">
              We use your personal data for the following purposes:
            </p>
            <ul className="list-disc list-inside text-gray-700 dark:text-gray-300 space-y-2 ml-2">
              <li>
                <strong className="text-gray-900 dark:text-gray-100">Personalization:</strong>{' '}
                Tailoring opportunity recommendations, alerts, and content to your interests and
                professional profile.
              </li>
              <li>
                <strong className="text-gray-900 dark:text-gray-100">Recommendations:</strong>{' '}
                Using behavioral profiles and activity patterns to surface relevant government
                contract opportunities.
              </li>
              <li>
                <strong className="text-gray-900 dark:text-gray-100">Analytics:</strong>{' '}
                Understanding platform usage to improve our services, fix issues, and develop new
                features.
              </li>
              <li>
                <strong className="text-gray-900 dark:text-gray-100">Communication:</strong>{' '}
                Sending alerts, notifications, and important service updates based on your
                preferences.
              </li>
              <li>
                <strong className="text-gray-900 dark:text-gray-100">Security:</strong>{' '}
                Protecting your account, detecting fraud, and maintaining platform integrity.
              </li>
            </ul>
          </section>

          {/* Data Retention */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">
              4. Data Retention
            </h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-3">
              We retain your personal data only as long as necessary to fulfill the purposes
              described in this policy:
            </p>
            <ul className="list-disc list-inside text-gray-700 dark:text-gray-300 space-y-2 ml-2">
              <li>
                <strong className="text-gray-900 dark:text-gray-100">Account Data:</strong>{' '}
                Retained for the duration of your account. Deleted upon account deletion request.
              </li>
              <li>
                <strong className="text-gray-900 dark:text-gray-100">Activity Data:</strong>{' '}
                Retained for up to 90 days for analytics and personalization purposes.
              </li>
              <li>
                <strong className="text-gray-900 dark:text-gray-100">User-Generated Content:</strong>{' '}
                Retained until you delete it or request account deletion.
              </li>
              <li>
                <strong className="text-gray-900 dark:text-gray-100">Backup Data:</strong>{' '}
                May persist in encrypted backups for up to 30 days after deletion.
              </li>
            </ul>
          </section>

          {/* Your Rights */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">
              5. Your Rights
            </h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-3">
              Under GDPR and applicable data protection laws, you have the following rights:
            </p>
            <ul className="list-disc list-inside text-gray-700 dark:text-gray-300 space-y-2 ml-2">
              <li>
                <strong className="text-gray-900 dark:text-gray-100">Right of Access:</strong>{' '}
                You can request a copy of all personal data we hold about you.
              </li>
              <li>
                <strong className="text-gray-900 dark:text-gray-100">Right to Rectification:</strong>{' '}
                You can update or correct your personal data at any time through your profile
                settings.
              </li>
              <li>
                <strong className="text-gray-900 dark:text-gray-100">Right to Erasure:</strong>{' '}
                You can request permanent deletion of your account and all associated data.
              </li>
              <li>
                <strong className="text-gray-900 dark:text-gray-100">Right to Data Portability:</strong>{' '}
                You can export your data in a machine-readable JSON format.
              </li>
              <li>
                <strong className="text-gray-900 dark:text-gray-100">Right to Restrict Processing:</strong>{' '}
                You can request that we limit how we use your data.
              </li>
              <li>
                <strong className="text-gray-900 dark:text-gray-100">Right to Object:</strong>{' '}
                You can object to data processing based on legitimate interests.
              </li>
            </ul>
          </section>

          {/* How to Exercise Your Rights */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">
              6. How to Exercise Your Rights
            </h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-3">
              You can exercise your data rights directly from your account:
            </p>
            <ul className="list-disc list-inside text-gray-700 dark:text-gray-300 space-y-2 ml-2">
              <li>
                <strong className="text-gray-900 dark:text-gray-100">Export Your Data:</strong>{' '}
                Go to your{' '}
                <Link
                  to="/profile"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Profile Settings
                </Link>{' '}
                and use the "Privacy & Data" tab to download a complete copy of your data.
              </li>
              <li>
                <strong className="text-gray-900 dark:text-gray-100">Delete Your Account:</strong>{' '}
                Go to your{' '}
                <Link
                  to="/profile"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Profile Settings
                </Link>{' '}
                and use the "Privacy & Data" tab to permanently delete your account and all
                associated data.
              </li>
              <li>
                <strong className="text-gray-900 dark:text-gray-100">Update Your Information:</strong>{' '}
                Edit your profile details directly from the Profile tab in your settings.
              </li>
            </ul>
          </section>

          {/* Contact Information */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">
              7. Contact Information
            </h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-3">
              If you have questions about this Privacy Policy, wish to exercise your rights, or have
              concerns about how your data is handled, please contact us:
            </p>
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 text-gray-700 dark:text-gray-300">
              <p><strong className="text-gray-900 dark:text-gray-100">Opportunity Pulse — Data Protection</strong></p>
              <p>Email: privacy@opportunitypulse.com</p>
              <p>Response time: Within 30 days of receiving your request</p>
            </div>
          </section>

          {/* Back link */}
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <Link
              to="/login"
              className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
            >
              Back to Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PrivacyPolicyPage;
