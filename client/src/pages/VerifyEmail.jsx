import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import Spinner from '../components/Spinner.jsx';

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const [state, setState] = useState({ loading: true, message: '' });
  useEffect(() => {
    const token = params.get('token');
    if (!token) { setState({ loading: false, message: 'This verification link is missing its token.' }); return; }
    api.get(`/auth/verify-email?token=${encodeURIComponent(token)}`, { auth: false })
      .then((data) => setState({ loading: false, message: data.message }))
      .catch((e) => setState({ loading: false, message: e.message }));
  }, [params]);
  return <div className="card max-w-lg mx-auto mt-10 text-center">{state.loading ? <Spinner /> : <><h1 className="text-xl">Recovery email verification</h1><p className="text-muted mt-2">{state.message}</p><Link className="btn btn-primary inline-flex mt-4" to="/login">Continue to login</Link></>}</div>;
}
