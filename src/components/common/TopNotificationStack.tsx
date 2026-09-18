import React from 'react';

interface TopNotificationStackProps {
  children: React.ReactNode;
}

export const TopNotificationStack: React.FC<TopNotificationStackProps> = ({ children }) => {
  return (
    <div className="fixed top-3 left-0 right-0 z-[100] flex flex-col items-center gap-2 pointer-events-none">
      {children}
    </div>
  );
};
