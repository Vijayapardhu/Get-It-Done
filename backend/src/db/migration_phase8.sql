-- Migration phase 8: Chat/Messaging system
-- Creates tables for direct messaging between users and workers related to bookings

-- Chat conversations table
create table if not exists chats (
    id uuid primary key default gen_random_uuid(),
    booking_id uuid references bookings(id) on delete set null,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null
);

-- Chat messages table
create table if not exists chat_messages (
    id uuid primary key default gen_random_uuid(),
    chat_id uuid references chats(id) on delete cascade not null,
    sender_id uuid references users(id) on delete cascade not null,
    content text not null,
    message_type text default 'text' not null, -- text, image, file, etc.
    attachments jsonb default '[]'::jsonb, -- Array of attachment objects
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    read_at timestamp with time zone null -- When the recipient last read this message
);

-- Indexes for performance
create index if not exists idx_chats_booking_id on chats(booking_id);
create index if not exists idx_chat_messages_chat_id on chat_messages(chat_id);
create index if not exists idx_chat_messages_sender_id on chat_messages(sender_id);
create index if not exists idx_chat_messages_created_on on chat_messages(created_at);
create index if not exists idx_chat_messages_read_at on chat_messages(read_at) where read_at is not null;

