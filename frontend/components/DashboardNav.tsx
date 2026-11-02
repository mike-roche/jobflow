'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search, FileText, Briefcase, Bell, Inbox } from 'lucide-react';

const navItems = [
  { href: '/dashboard/jobs', label: 'Jobs', icon: Search },
  { href: '/dashboard/queue', label: 'Ready to Apply', icon: Inbox },
  { href: '/dashboard/cv', label: 'My CV', icon: FileText },
  { href: '/dashboard/applications', label: 'Applications', icon: Briefcase },
  { href: '/dashboard/alerts', label: 'Alerts', icon: Bell },
];

export default function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <Link href="/dashboard/jobs" className="text-xl font-bold text-primary">
              JobFlow
            </Link>
            <div className="flex gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-primary text-white'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <Icon size={18} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}