import FeedSkeleton from '@/components/ui/FeedSkeleton';

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <FeedSkeleton count={4} />
    </div>
  );
}
