import React from 'react';
import ProfileSettings from '../components/profile/ProfileSettings';

function ProfilePage() {
  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
        Account Settings
      </h1>
      <ProfileSettings />
    </div>
  );
}

export default ProfilePage;
