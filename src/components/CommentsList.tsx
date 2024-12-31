import React from 'react';
import { CommentWithUser } from '../types';

interface CommentProps {
  comment: CommentWithUser;
  children?: React.ReactNode;
}

const CommentItem: React.FC<CommentProps> = ({ comment, children }) => {
  return (
    <li className="mb-4 border-l-2 pl-4">
      <div className="flex flex-col">
        <p className="font-bold">{comment.profiles?.username || 'Anonymous'}</p>
        <p>{comment.comment_text}</p>
        <small className="text-gray-500">
          Posted on {new Date(comment.created_at).toLocaleString()}
        </small>
        {children && <ul className="ml-4 mt-2">{children}</ul>}
      </div>
    </li>
  );
};

interface CommentsListProps {
  comments: CommentWithUser[];
}

const CommentsList: React.FC<CommentsListProps> = ({ comments }) => {
  // Recursively render comments and replies
  const renderComments = (comments: CommentWithUser[]) => {
    return comments.map((comment) => (
      <CommentItem key={comment.id} comment={comment}>
        {comment.children && renderComments(comment.children)} {/* Recursively render replies */}
      </CommentItem>
    ));
  };

  return <ul>{renderComments(comments)}</ul>;
};

export default CommentsList;
