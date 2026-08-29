import React, { useMemo, useState } from "react";
import {
  MessageSquare,
  Heart,
  Repeat2,
  Users,
  CheckCircle,
} from "lucide-react";

export default function FanPulseApp({
  onBack,
  onTriggerEvent,
  feed = [],
  trending = [],
  polls = [],
  sentiment = null,
}) {
  const [activeTab, setActiveTab] = useState("feed");
  const [filter, setFilter] = useState("all");
  const normalizedFeed = Array.isArray(feed) ? feed : [];
  const normalizedTrending = Array.isArray(trending) ? trending : [];
  const normalizedPolls = Array.isArray(polls) ? polls : [];
  const sentimentSummary = useMemo(() => {
    if (!sentiment || typeof sentiment !== "object") return null;
    if (!Number.isFinite(Number(sentiment.overall))) return null;
    return {
      overall: Number(sentiment.overall),
      change: Number.isFinite(Number(sentiment.change)) ? Number(sentiment.change) : 0,
      breakdown: sentiment.breakdown || null,
    };
  }, [sentiment]);

  const filteredPosts = normalizedFeed.filter((post) => {
    if (filter === "all") return true;
    return post.sentiment === filter;
  });

  return (
    <div className="h-full bg-[#0b1014] text-white flex flex-col font-sans">
      <div className="bg-gradient-to-r from-purple-600 to-pink-600 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Users size={24} className="text-white" />
            <h1 className="text-2xl font-black">FAN PULSE</h1>
          </div>
          {sentimentSummary ? (
            <SentimentBadge sentiment={sentimentSummary.overall} change={sentimentSummary.change} />
          ) : null}
        </div>

        <div className="flex gap-2">
          <TabButton active={activeTab === "feed"} onClick={() => setActiveTab("feed")}>?? Feed</TabButton>
          <TabButton active={activeTab === "trending"} onClick={() => setActiveTab("trending")}>?? Trending</TabButton>
          <TabButton active={activeTab === "polls"} onClick={() => setActiveTab("polls")}>?? Polls</TabButton>
          <TabButton active={activeTab === "sentiment"} onClick={() => setActiveTab("sentiment")}>?? Sentiment</TabButton>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {activeTab === "feed" && (
          <FeedView posts={filteredPosts} filter={filter} onFilterChange={setFilter} />
        )}
        {activeTab === "trending" && (
          <TrendingView topics={normalizedTrending} />
        )}
        {activeTab === "polls" && (
          <PollsView polls={normalizedPolls} />
        )}
        {activeTab === "sentiment" && (
          <SentimentView sentiment={sentimentSummary} />
        )}
      </div>
    </div>
  );
}

function FeedView({ posts, filter, onFilterChange }) {
  return (
    <div className="h-full flex flex-col">
      <div className="bg-[#1f2937] p-3 flex gap-2 border-b border-gray-700">
        <FilterButton active={filter === "all"} onClick={() => onFilterChange("all")}>Todos</FilterButton>
        <FilterButton active={filter === "positive"} onClick={() => onFilterChange("positive")} color="green">? Positivos</FilterButton>
        <FilterButton active={filter === "negative"} onClick={() => onFilterChange("negative")} color="red">? Negativos</FilterButton>
      </div>

      <div className="flex-1 overflow-y-auto pb-20">
        {posts.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <CheckCircle size={48} className="mx-auto mb-4 text-green-500" />
            <p>Sin actividad reciente</p>
          </div>
        ) : (
          posts.map((post) => (
            <PostCard key={post.id || post.created_at || post.timestamp} post={post} />
          ))
        )}
      </div>
    </div>
  );
}

function PostCard({ post }) {
  const engagement = post.engagement || post.stats || {};
  const replies = Number.isFinite(Number(engagement.replies)) ? Number(engagement.replies) : null;
  const retweets = Number.isFinite(Number(engagement.retweets)) ? Number(engagement.retweets) : null;
  const likes = Number.isFinite(Number(engagement.likes)) ? Number(engagement.likes) : null;
  const showEngagement = replies !== null || retweets !== null || likes !== null;
  const author = post.author || post.sender || post.source || "";
  const authorHandle = post.authorHandle || post.sourceHandle || post.handle || "";
  const timestamp = post.timestamp || post.time || post.created_at || "";
  const text = post.text || post.body || post.content || "";

  return (
    <div className="border-b border-gray-800 p-4">
      <div className="flex justify-between items-start mb-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm">{author}</span>
            {post.verified && <CheckCircle size={12} className="text-blue-400" />}
          </div>
          {authorHandle ? <p className="text-xs text-gray-500">{authorHandle}</p> : null}
        </div>
        {timestamp ? <span className="text-xs text-gray-500">{timestamp}</span> : null}
      </div>

      {text ? <p className="text-sm text-gray-200 mb-3 whitespace-pre-line">{text}</p> : null}

      {showEngagement ? (
        <div className="flex items-center gap-4 text-xs text-gray-500">
          {replies !== null && <span className="flex items-center gap-1"><MessageSquare size={12} /> {replies}</span>}
          {retweets !== null && <span className="flex items-center gap-1"><Repeat2 size={12} /> {retweets}</span>}
          {likes !== null && <span className="flex items-center gap-1"><Heart size={12} /> {likes}</span>}
        </div>
      ) : null}
    </div>
  );
}

function TrendingView({ topics }) {
  return (
    <div className="h-full overflow-y-auto p-4 space-y-3">
      {topics.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <CheckCircle size={48} className="mx-auto mb-4 text-green-500" />
          <p>Sin tendencias activas</p>
        </div>
      ) : (
        topics.map((topic) => (
          <div key={topic.id || topic.hashtag || topic.label} className="bg-[#1f2937] p-4 rounded-xl border border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold">{topic.hashtag || topic.label}</h3>
              {Number.isFinite(Number(topic.changePercent)) ? (
                <span className={`text-xs ${topic.changePercent >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {topic.changePercent >= 0 ? "+" : ""}{topic.changePercent}%
                </span>
              ) : null}
            </div>
            {Number.isFinite(Number(topic.tweets)) ? (
              <p className="text-xs text-gray-400">{topic.tweets} tweets</p>
            ) : null}
          </div>
        ))
      )}
    </div>
  );
}

function PollsView({ polls }) {
  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      {polls.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <CheckCircle size={48} className="mx-auto mb-4 text-green-500" />
          <p>Sin encuestas activas</p>
        </div>
      ) : (
        polls.map((poll) => (
          <div key={poll.id || poll.question} className="bg-[#1f2937] p-4 rounded-xl border border-gray-700">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-sm">{poll.question}</h3>
              {poll.endsIn ? <span className="text-xs text-gray-500">{poll.endsIn}</span> : null}
            </div>
            <div className="space-y-2">
              {(poll.options || []).map((opt) => (
                <div key={opt.id || opt.text}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span>{opt.text}</span>
                    {Number.isFinite(Number(opt.percentage)) ? <span>{opt.percentage}%</span> : null}
                  </div>
                  {Number.isFinite(Number(opt.percentage)) ? (
                    <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500" style={{ width: `${opt.percentage}%` }} />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function SentimentView({ sentiment }) {
  return (
    <div className="h-full overflow-y-auto p-4">
      {sentiment ? (
        <div className="bg-[#1f2937] p-4 rounded-xl border border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold">Sentimiento General</h3>
            <SentimentBadge sentiment={sentiment.overall} change={sentiment.change} />
          </div>
          {sentiment.breakdown ? (
            <div className="space-y-2 text-xs">
              {Number.isFinite(Number(sentiment.breakdown.veryHappy)) && (
                <div className="flex justify-between"><span>Muy felices</span><span>{sentiment.breakdown.veryHappy}%</span></div>
              )}
              {Number.isFinite(Number(sentiment.breakdown.happy)) && (
                <div className="flex justify-between"><span>Felices</span><span>{sentiment.breakdown.happy}%</span></div>
              )}
              {Number.isFinite(Number(sentiment.breakdown.neutral)) && (
                <div className="flex justify-between"><span>Neutrales</span><span>{sentiment.breakdown.neutral}%</span></div>
              )}
              {Number.isFinite(Number(sentiment.breakdown.unhappy)) && (
                <div className="flex justify-between"><span>Infelices</span><span>{sentiment.breakdown.unhappy}%</span></div>
              )}
              {Number.isFinite(Number(sentiment.breakdown.veryUnhappy)) && (
                <div className="flex justify-between"><span>Muy infelices</span><span>{sentiment.breakdown.veryUnhappy}%</span></div>
              )}
            </div>
          ) : (
            <div className="text-xs text-gray-400">Sin desglose disponible.</div>
          )}
        </div>
      ) : (
        <div className="text-center py-20 text-gray-500">
          <CheckCircle size={48} className="mx-auto mb-4 text-green-500" />
          <p>Sin datos de sentimiento</p>
        </div>
      )}
    </div>
  );
}

const getSentimentLabel = (value) => {
  if (!Number.isFinite(Number(value))) return "Sin datos";
  if (value >= 70) return "Muy felices";
  if (value >= 55) return "Felices";
  if (value >= 45) return "Neutrales";
  if (value >= 30) return "Infelices";
  return "Muy infelices";
};

const getSentimentClass = (value) => {
  if (!Number.isFinite(Number(value))) return "bg-white/20 text-white";
  if (value >= 70) return "bg-green-500/20 text-green-300";
  if (value >= 50) return "bg-yellow-500/20 text-yellow-300";
  return "bg-red-500/20 text-red-300";
};

function SentimentBadge({ sentiment, change }) {
  const label = getSentimentLabel(Number(sentiment));
  let trend = "Estable";
  if (Number.isFinite(Number(change)) && Number(change) !== 0) {
    trend = Number(change) > 0 ? "Mejora" : "Empeora";
  }
  return (
    <div className={`px-3 py-1 rounded-full text-xs font-bold ${getSentimentClass(Number(sentiment))}`}>
      {label} · {trend}
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button onClick={onClick} className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all ${active ? "bg-white text-purple-600" : "bg-white/20 text-white hover:bg-white/30"}`}>
      {children}
    </button>
  );
}

function FilterButton({ active, onClick, color, children }) {
  const activeStyle = color === "green"
    ? "bg-green-500/20 text-green-300"
    : color === "red"
      ? "bg-red-500/20 text-red-300"
      : "bg-white text-purple-600";

  return (
    <button onClick={onClick} className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all ${active ? activeStyle : "bg-white/20 text-white hover:bg-white/30"}`}>
      {children}
    </button>
  );
}
