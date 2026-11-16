import mongoose from 'mongoose';

export function requireTransactionTopology(hello: { setName?: string; msg?: string; logicalSessionTimeoutMinutes?: number | null }) {
  if ((!hello.setName && hello.msg !== 'isdbgrid') || hello.logicalSessionTimeoutMinutes == null) {
    throw new Error('MongoDB must be a replica set or sharded cluster with session support');
  }
}

export async function checkDatabase() {
  if (!mongoose.connection.db) throw new Error('Database is disconnected');
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  requireTransactionTopology(hello);
  // A transactional read checks transaction support without changing application data.
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    await mongoose.connection.db.collection('users').findOne({}, { session, projection: { _id: 1 } });
    await session.abortTransaction();
  } finally { await session.endSession(); }
}
