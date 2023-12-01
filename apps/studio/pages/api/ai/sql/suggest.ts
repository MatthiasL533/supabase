import { OpenAIStream, streamToResponse } from 'ai'
import { codeBlock, oneLine, stripIndent } from 'common-tags'
import apiWrapper from 'lib/api/apiWrapper'
import { NextApiHandler, NextApiRequest, NextApiResponse } from 'next'
import OpenAI from 'openai'

const openAiKey = process.env.OPENAI_KEY

const handler: NextApiHandler = (req, res) => {
  if (!openAiKey) {
    return res.status(500).json({
      error: 'No OPENAI_KEY set. Create this environment variable to use AI features.',
    })
  }

  const { method } = req

  switch (method) {
    case 'POST':
      return handlePost(req, res)
    default:
      res.setHeader('Allow', ['POST'])
      res.status(405).json({ error: `Method ${method} Not Allowed` })
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const openai = new OpenAI({ apiKey: openAiKey })
  const { body } = req

  const { messages, entityDefinitions } = body as {
    messages: { content: string; role: 'user' | 'assistant' }[]
    entityDefinitions: string[]
  }

  const initMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: stripIndent`
        You're an Postgres expert in writing row level security policies. Your purpose is to 
        generate a policy with the constraints given by the user. You will be provided a schema 
        on which the policy should be applied.

        The output should use the following instructions:
        - The generated SQL must be valid SQL.
        - Always use double apostrophe in SQL strings (eg. 'Night''s watch')
        - You can use only CREATE POLICY queries, no other queries are allowed.
        - You can add short explanations to your messages.
        - The result should be a valid markdown. The SQL code should be wrapped in \`\`\`.
        - Always use "auth.uid()" instead of "current_user".
        - Only use "WITH CHECK" on INSERT or UPDATE policies.
        - The policy name should be short text explaining the policy, enclosed in double quotes.
        - Always make sure that every \`\`\` has a corresponding ending tag \`\`\`.
        - Always put explanations as separate text. Don't use inline SQL comments. 
        
        The output should look like this: 
        "CREATE POLICY user_policy ON users FOR INSERT USING (user_name = current_user) WITH (true);" 
      `,
    },
  ]

  if (entityDefinitions) {
    const definitions = codeBlock`${entityDefinitions.join('\n\n')}`
    initMessages.push({
      role: 'user',
      content: oneLine`Here is my database schema for reference: ${definitions}`,
    })
  }

  if (messages) {
    initMessages.push(...messages)
  }

  const completionOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
    model: 'gpt-3.5-turbo-1106',
    messages: initMessages,
    max_tokens: 1024,
    temperature: 0,
    stream: true,
  }

  try {
    const response = await openai.chat.completions.create(completionOptions)
    const stream = OpenAIStream(response)
    return streamToResponse(stream, res)
  } catch (error: any) {
    console.error(error)

    return res.status(500).json({
      error: 'There was an error processing your request',
    })
  }
}

const wrapper = (req: NextApiRequest, res: NextApiResponse) => apiWrapper(req, res, handler)

export default wrapper
