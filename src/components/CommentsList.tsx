import React from 'react';
import { CommentWithUser } from '../types';

interface CommentProps {
  comment: CommentWithUser;
  level: number; // Track indentation level
}

const CommentItem: React.FC<CommentProps> = ({ comment, level }) => {
  const indentStyle = {
    marginLeft: `${level * 20}px`, // Indent replies by 20px per level
  };

  return (
    <li className="mb-4">
      <div className="flex flex-col" style={indentStyle}>
        <p className="font-bold">{comment.profiles?.username || 'Anonymous'}</p>

        {comment.reply_of && comment.parent_comment && (
          <div className="text-gray-500 italic mb-2">
            <blockquote>
              {`"${comment.parent_comment.comment_text}"`} <br />
              <span className="text-sm">- Replied to by {comment.parent_comment.profiles?.username || 'Anonymous'}</span>
            </blockquote>
          </div>
        )}

        <p>{comment.comment_text}</p>
        <small className="text-gray-500">
          Posted on {new Date(comment.created_at).toLocaleString()}
        </small>

        {/* Recursively render replies */}
        {comment.children && comment.children.length > 0 && (
          <ul className="ml-4 mt-2">
            {comment.children.map((child) => (
              <CommentItem key={child.id} comment={child} level={level + 1} />
            ))}
          </ul>
        )}
      </div>
    </li>
  );
};

interface CommentsListProps {
  comments: CommentWithUser[];
}

const CommentsList: React.FC<CommentsListProps> = ({ comments }) => {
  // Recursively render comments and replies
  const renderComments = (comments: CommentWithUser[], level: number = 0) => {
    return comments.map((comment) => (
      <CommentItem key={comment.id} comment={comment} level={level} />
    ));
  };

  return <ul>{renderComments(comments)}</ul>;
};

export default CommentsList;
