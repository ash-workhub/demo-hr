// src/components/Providers.jsx
// Client-side providers. HeroUI v3 components work standalone — no HeroUIProvider.
'use client';
import { RouterProvider } from '@heroui/react';
import { useRouter } from 'next/navigation';

export default function Providers({ children }) {
  const router = useRouter();
  return (
    <RouterProvider navigate={(to) => router.push(to)}>
      {children}
    </RouterProvider>
  );
}
