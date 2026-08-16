/**
 * Преобразование строки вьюхи v_tasks_feed в camelCase-объект для клиента.
 * Вынесено из route-файла: Next.js разрешает в роутах только экспорт
 * обработчиков (GET/POST/...), любой другой export ломает сборку.
 */

/** Строка из v_tasks_feed → camelCase для клиента. */
export function mapTaskRow(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    authorId: String(row.author_id),
    isPaid: Boolean(row.is_paid),
    kind: row.kind,
    title: row.title,
    description: row.description,
    category: row.category,
    reward: Number(row.reward ?? 0),
    priority: row.priority,
    slots: Number(row.slots ?? 1),
    deadlineAt: row.deadline_at,
    scheduledAt: row.scheduled_at,
    address: row.address,
    lat: row.lat === null || row.lat === undefined ? null : Number(row.lat),
    lng: row.lng === null || row.lng === undefined ? null : Number(row.lng),
    minRating: Number(row.min_rating ?? 0),
    minAccountDays: Number(row.min_account_days ?? 0),
    minTasksDone: Number(row.min_tasks_done ?? 0),
    allowNewcomers: Boolean(row.allow_newcomers),
    status: row.status,
    paymentStatus: row.payment_status,
    submittedAt: row.submitted_at,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at,
    cancelReason: row.cancel_reason,
    isArchived: Boolean(row.is_archived),
    createdAt: row.created_at,
    authorName: row.author_name,
    authorAvatarUrl: row.author_avatar_url,
    authorRating: Number(row.author_rating ?? 0),
    authorReviewCount: Number(row.author_review_count ?? 0),
    authorTasksCreated: Number(row.author_tasks_created ?? 0),
    authorAccountDays: Number(row.author_account_days ?? 0),
    takenSlots: Number(row.taken_slots ?? 0),
  };
}
